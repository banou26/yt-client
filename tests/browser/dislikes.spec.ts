import type { Page, Request, Route } from '@playwright/test'

import { expect, test } from './test'

/* Dislike counts on the watch page, with Return YouTube Dislike answered by the spec and the rest from the live source: `dQw4w9WgXcQ` has a like count. */

const VIDEO_ID = 'dQw4w9WgXcQ'
const LOOKUP_URL = `https://returnyoutubedislikeapi.com/votes?videoId=${VIDEO_ID}`

// returnyoutubedislikeapi.com/votes answers, recorded 2026-11-09
const RICK_ROLL = { id: VIDEO_ID, dateCreated: '2022-04-09T22:01:38.222268Z', likes: 19496469, rawDislikes: 6720, rawLikes: 130554, dislikes: 521680, rating: 4.895758593863998, viewCount: 1835084823, deleted: false }
const NEVER_SEEN = { id: VIDEO_ID, dateCreated: '2026-11-09T12:24:15.3920309Z', likes: 0, rawDislikes: null, rawLikes: null, dislikes: 0, rating: 0, viewCount: 0, deleted: false }

const answer = (body: unknown, status = 200) => (route: Route) =>
  route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, json: body })

const routeLookups = async (page: Page, handle: (route: Route) => unknown) => {
  const requests: Request[] = []
  await page.route('https://returnyoutubedislikeapi.com/**', (route) => {
    requests.push(route.request())
    return handle(route)
  })
  return requests
}

const likeButtons = (page: Page) => ({
  like: page.locator('main .like-pill .like'),
  dislike: page.locator('main .like-pill .dislike'),
})

// the lookup's answer has reached the page and a render has passed since
const answered = async (page: Page) => {
  const response = await page.waitForResponse(LOOKUP_URL)
  await response.finished()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

test('shows the dislike count in the Dislike button, written like the like count', async ({ page }) => {
  test.setTimeout(240_000)
  const requests = await routeLookups(page, answer(RICK_ROLL))
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const { like, dislike } = likeButtons(page)
  await expect(dislike).toHaveText('522K', { timeout: 120_000 })
  await expect(like).toHaveText(/^[\d.]+[KMB]$/, { timeout: 60_000 })

  expect(requests.map(request => `${request.method()} ${request.url()}`)).toEqual([`GET ${LOOKUP_URL}`])
  // a custom header would cost a preflight and is not needed
  const sent = Object.keys(await requests[0]!.allHeaders())
  expect(sent.filter(name => !/^(accept|accept-language|origin|referer|user-agent|sec-[a-z-]+)$/.test(name))).toEqual([])

  const text = (button: typeof like) => button.locator('span').evaluate((element) => {
    const style = getComputedStyle(element)
    return `${style.fontSize} ${style.fontWeight}`
  })
  expect(await text(dislike)).toBe(await text(like))
})

test('shows no count for a video the service has never seen', async ({ page }) => {
  test.setTimeout(240_000)
  const requests = await routeLookups(page, answer(NEVER_SEEN))
  const done = answered(page)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  await done
  const { like, dislike } = likeButtons(page)
  await expect(like).toHaveText(/^[\d.]+[KMB]$/, { timeout: 120_000 })
  expect(requests).toHaveLength(1)
  await expect(dislike).toHaveText('')
})

test('shows no count when the service is over its rate limit', async ({ page }) => {
  test.setTimeout(240_000)
  // a body that would show a count, so only the status keeps it hidden
  const requests = await routeLookups(page, answer(RICK_ROLL, 429))
  const done = answered(page)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  await done
  const { like, dislike } = likeButtons(page)
  await expect(like).toHaveText(/^[\d.]+[KMB]$/, { timeout: 120_000 })
  expect(requests).toHaveLength(1)
  await expect(dislike).toHaveText('')
})

test('renders the watch page without waiting for a lookup that never answers', async ({ page }) => {
  test.setTimeout(240_000)
  const requests = await routeLookups(page, () => {})
  await page.goto(`/watch?v=${VIDEO_ID}`)
  await expect.poll(() => requests.length, { timeout: 60_000 }).toBe(1)
  const { like, dislike } = likeButtons(page)
  await expect(page.locator('main h1')).toBeVisible({ timeout: 120_000 })
  await expect(like).toHaveText(/^[\d.]+[KMB]$/)
  await expect(dislike).toHaveText('')
})

test('asks for nothing while the setting is off', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(() => localStorage.setItem('yt-client:settings', JSON.stringify({ showDislikes: false })))
  const requests = await routeLookups(page, answer(RICK_ROLL))
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const { like, dislike } = likeButtons(page)
  // the lookup starts as the page mounts, long before the watch answer brings the like count
  await expect(like).toHaveText(/^[\d.]+[KMB]$/, { timeout: 120_000 })
  expect(requests).toHaveLength(0)
  await expect(dislike).toHaveText('')
})

test('Settings turns the counts off, crediting Return YouTube Dislike', async ({ page }) => {
  await page.goto('/settings')
  const main = page.locator('main')
  await expect(main.getByRole('link', { name: 'Return YouTube Dislike' })).toHaveAttribute('href', 'https://returnyoutubedislike.com')
  const toggle = main.getByRole('checkbox', { name: 'Show dislike counts' })
  await expect(toggle).toBeChecked()
  await toggle.click()
  await expect(toggle).not.toBeChecked()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yt-client:settings') ?? '{}').showDislikes)).toBe(false)
})

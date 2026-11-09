import type { Page, Request } from '@playwright/test'

import { expect, test } from './test'

/* SponsorBlock against the live source on `jNQXAC9IVRw`, which is 19 s long and has no sponsor part of its own, so
   every part here is a routed answer. Its hash prefix is 6745, which `zzzzzzzzzzz` is made to share. */

const VIDEO_ID = 'jNQXAC9IVRw'

declare global {
  interface Window { playerTimes?: number[] }
}

const sponsor = (start: number, end: number) => ({ category: 'sponsor', actionType: 'skip', segment: [start, end], UUID: `${start}-${end}`, videoDuration: 19 })

const answerSponsors = async (page: Page, parts = [sponsor(5, 8)]) => {
  const requests: Request[] = []
  await page.route('https://sponsor.ajay.app/**', (route) => {
    requests.push(route.request())
    return route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([{ videoID: VIDEO_ID, segments: parts }, { videoID: 'zzzzzzzzzzz', segments: [sponsor(1, 3)] }]),
    })
  })
  return requests
}

// every time the player's clock reported, from the first video element on, restarts included
const logTimes = (page: Page) => page.addInitScript(() => {
  const times: number[] = []
  window.playerTimes = times
  document.addEventListener('timeupdate', (event) => {
    const video = event.target as HTMLVideoElement
    if (video.closest('[data-player-root]')) times.push(video.currentTime)
  }, true)
})

const timesFrom = async (page: Page, index: number) => (await page.evaluate(() => window.playerTimes ?? [])).slice(index)
const logged = (page: Page) => page.evaluate(() => window.playerTimes?.length ?? 0)

const startPlayback = async (page: Page) => {
  const video = page.locator('[data-player-root] video')
  await expect(video).toBeVisible({ timeout: 60_000 })
  await expect.poll(
    () => video.evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 120_000, message: 'playback did not start' },
  ).toBeGreaterThan(1)
  return video
}

const currentTime = (page: Page) => page.locator('[data-player-root] video').evaluate(element => (element as HTMLVideoElement).currentTime)

// a seek made from outside the player, like the viewer's: the player's own come before playback starts
const seek = (page: Page, seconds: number) => page.locator('[data-player-root] video').evaluate((element, to) => {
  (element as HTMLVideoElement).currentTime = to
}, seconds)

const passes = (page: Page, seconds: number) =>
  expect.poll(() => currentTime(page), { timeout: 60_000, message: `playback did not pass ${seconds} s` }).toBeGreaterThan(seconds)

const marks = (page: Page) => page.locator('[data-player-root] .rail .sponsor')
const control = (page: Page, name: string) => page.locator('[data-player-root]').getByRole('button', { name, exact: true })

const within = (times: number[], low: number, high: number) => times.filter(time => time >= low && time < high)

const openWithSponsor = async (page: Page, parts?: ReturnType<typeof sponsor>[]) => {
  const requests = await answerSponsors(page, parts)
  await logTimes(page)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  await startPlayback(page)
  await expect(marks(page)).toHaveCount(1, { timeout: 30_000 })
  return requests
}

test('asks SponsorBlock by hash prefix only, then skips the video\'s own sponsor part', async ({ page }) => {
  test.setTimeout(240_000)
  const requests = await openWithSponsor(page)

  expect(requests).toHaveLength(1)
  const [request] = requests
  const url = new URL(request!.url())
  expect(url.pathname).toBe('/api/skipSegments/6745')
  expect([url.searchParams.get('categories'), url.searchParams.get('actionTypes')]).toEqual(['["sponsor"]', '["skip"]'])
  const headers = await request!.allHeaders()
  // the page's origin alone, so a Referer was there to look at
  expect(headers.referer).toBe(`${new URL(page.url()).origin}/`)
  expect(JSON.stringify([request!.url(), headers])).not.toContain(VIDEO_ID)

  const mark = await marks(page).evaluate((element) => {
    const rail = element.parentElement!.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    return { left: (box.left - rail.left) / rail.width, width: box.width / rail.width }
  })
  const duration = await page.locator('[data-player-root] video').evaluate(element => (element as HTMLVideoElement).duration)
  expect(mark.left).toBeCloseTo(5 / duration, 2)
  expect(mark.width).toBeCloseTo(3 / duration, 2)

  const from = await logged(page)
  await seek(page, 0.5)
  await expect(control(page, 'Skip sponsor')).toBeVisible()
  await expect(control(page, 'Undo')).toBeVisible({ timeout: 30_000 })
  await expect(control(page, 'Skip sponsor')).toHaveCount(0)
  await passes(page, 9)

  const times = await timesFrom(page, from)
  expect(within(times, 1.2, 2.8).length, 'the part of another video sharing the prefix was skipped').toBeGreaterThan(0)
  expect(within(times, 6, 8), 'the sponsor part played on past its first second').toEqual([])
})

test('Undo goes back to where the skip started and plays the part', async ({ page }) => {
  test.setTimeout(240_000)
  await openWithSponsor(page)
  await seek(page, 3)
  await control(page, 'Undo').click({ timeout: 30_000 })
  const from = await logged(page)
  await expect.poll(() => currentTime(page)).toBeGreaterThan(5)
  expect(await currentTime(page)).toBeLessThan(6.5)
  await passes(page, 8.5)
  expect(within(await timesFrom(page, from), 6.5, 7.5).length, 'the part was skipped again').toBeGreaterThan(0)
})

test('Skip sponsor jumps over the coming part now, and Undo then plays all of it', async ({ page }) => {
  test.setTimeout(240_000)
  await openWithSponsor(page)
  await seek(page, 1)
  await control(page, 'Skip sponsor').click()
  await expect.poll(() => currentTime(page), { timeout: 5_000 }).toBeGreaterThanOrEqual(8)

  await control(page, 'Undo').click()
  const from = await logged(page)
  await expect.poll(() => currentTime(page)).toBeLessThan(5)
  await passes(page, 8.5)
  expect(within(await timesFrom(page, from), 5.5, 7.5).length, 'the part was skipped after Undo').toBeGreaterThan(0)
})

test('a seek into a sponsor part plays it, and leaves the Undo of an earlier skip behind', async ({ page }) => {
  test.setTimeout(240_000)
  await openWithSponsor(page)
  await seek(page, 3)
  await expect(control(page, 'Undo')).toBeVisible({ timeout: 30_000 })
  await seek(page, 6)
  const from = await logged(page)
  await passes(page, 8.5)
  expect(within(await timesFrom(page, from), 6.5, 7.5).length, 'the part the viewer sought into was skipped').toBeGreaterThan(0)
  // read once, not retried: the first skip's Undo would show again from 8 to 13
  expect(await control(page, 'Undo').count()).toBe(0)
  expect(await currentTime(page)).toBeLessThan(13)
})

test('a start inside a sponsor part still skips it, since the player\'s own seek there is not the viewer\'s', async ({ page }) => {
  test.setTimeout(240_000)
  await answerSponsors(page, [sponsor(5, 15)])
  await logTimes(page)
  await page.goto(`/watch?v=${VIDEO_ID}&t=6`)
  await expect(control(page, 'Undo')).toBeVisible({ timeout: 120_000 })
  expect(await currentTime(page)).toBeGreaterThanOrEqual(15)
  // the answer can land after playback starts at 6, so the part may play for a while before the skip
  expect(within(await timesFrom(page, 0), 10, 15)).toEqual([])
})

test('the video plays on while SponsorBlock never answers', async ({ page }) => {
  test.setTimeout(240_000)
  let asked = 0
  await page.route('https://sponsor.ajay.app/**', () => {
    asked += 1
  })
  await logTimes(page)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  await startPlayback(page)
  await expect.poll(() => asked).toBe(1)
  await seek(page, 4)
  await passes(page, 8.5)
  expect(within(await timesFrom(page, 0), 6, 8).length).toBeGreaterThan(0)
  await expect(marks(page)).toHaveCount(0)
  await expect(control(page, 'Skip sponsor')).toHaveCount(0)
  await expect(control(page, 'Undo')).toHaveCount(0)
})

test('with Skip sponsors off, SponsorBlock is never asked and the part plays', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(() => localStorage.setItem('yt-client:settings', JSON.stringify({ skipSponsors: false })))
  const requests = await answerSponsors(page)
  await logTimes(page)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  await startPlayback(page)
  await seek(page, 4)
  await passes(page, 9)
  expect(within(await timesFrom(page, 0), 6, 8).length).toBeGreaterThan(0)
  expect(requests).toHaveLength(0)
  await expect(marks(page)).toHaveCount(0)
})

// the shared fixture's answer, which keeps every other spec off SponsorBlock's live data: the live answer for 6745 is a 200
test('a spec that routes nothing gets the empty answer', async ({ page }) => {
  test.setTimeout(240_000)
  const answered = page.waitForResponse(response => response.url().startsWith('https://sponsor.ajay.app/'))
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const answer = await answered
  expect(answer.status()).toBe(404)
  expect(await answer.json()).toEqual([])
})

test('Settings turns Skip sponsors off and on, and credits SponsorBlock', async ({ page }) => {
  await page.goto('/settings')
  const toggle = page.getByRole('checkbox', { name: 'Skip sponsors' })
  await expect(toggle).toBeChecked()
  await toggle.click()
  await expect(toggle).not.toBeChecked()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yt-client:settings') ?? '{}').skipSponsors)).toBe(false)
  await toggle.click()
  await expect(toggle).toBeChecked()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yt-client:settings') ?? '{}').skipSponsors)).toBe(true)
  const row = page.locator('main .row').filter({ has: toggle })
  await expect(row).toHaveText('Skip sponsors Using SponsorBlock')
  await expect(row.getByRole('link', { name: 'SponsorBlock' })).toHaveAttribute('href', 'https://sponsor.ajay.app')
})

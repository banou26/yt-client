import type { Locator, Page } from '@playwright/test'

import { expect, test } from '@playwright/test'

/* The watch page's player against the live source: `dQw4w9WgXcQ` is a 213 s static video with a related list. */

const VIDEO_ID = 'dQw4w9WgXcQ'

const startPlayback = async (page: Page) => {
  const video = page.locator('video')
  await expect(video).toBeVisible({ timeout: 60_000 })
  await expect.poll(
    () => video.evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 120_000, message: 'playback did not start' },
  ).toBeGreaterThan(1)
  return video
}

const seekToEnd = (video: Locator) =>
  video.evaluate((element) => {
    const player = element as HTMLVideoElement
    player.currentTime = player.duration - 1.5
    void player.play().catch(() => {})
  })

const runToEnd = async (video: Locator) => {
  await seekToEnd(video)
  await expect.poll(
    () => video.evaluate(element => (element as HTMLVideoElement).ended),
    { timeout: 60_000, message: 'the video did not reach its end' },
  ).toBe(true)
}

const videoIdOf = (url: string) => new URL(url, 'http://localhost').searchParams.get('v')

const withAutoplay = (page: Page, autoplay: boolean) =>
  page.addInitScript((value) => {
    localStorage.setItem('yt-client:settings', JSON.stringify({ autoplay: value }))
  }, autoplay)

test('counts down at the end, then plays the first related video', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  const firstRelated = page.locator('main aside article a[href^="/watch"]').first()
  await expect(firstRelated).toBeVisible({ timeout: 60_000 })
  const expected = videoIdOf((await firstRelated.getAttribute('href'))!)

  await runToEnd(video)
  await expect(page.locator('[data-end-screen="countdown"]')).toBeVisible()
  await expect(page.getByText(/^Up next in \d$/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()

  await expect.poll(() => videoIdOf(page.url()), { timeout: 30_000 }).toBe(expected)
  await startPlayback(page)
})

test('cancelling the countdown leaves the end screen and the page', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  await runToEnd(video)

  await page.getByRole('button', { name: 'Cancel' }).click()
  const endScreen = page.locator('[data-end-screen="suggestions"]')
  await expect(endScreen).toBeVisible()
  expect(await endScreen.locator('a[href^="/watch"]').count()).toBeGreaterThan(0)
  await page.waitForTimeout(7_000)
  expect(videoIdOf(page.url())).toBe(VIDEO_ID)
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible()
})

test('with Autoplay off, shows suggestions and the player bar switch turns it back on', async ({ page }) => {
  test.setTimeout(300_000)
  await withAutoplay(page, false)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  await runToEnd(video)

  await expect(page.locator('[data-end-screen="suggestions"]')).toBeVisible()
  await expect(page.locator('[data-end-screen="countdown"]')).toHaveCount(0)
  await page.waitForTimeout(7_000)
  expect(videoIdOf(page.url())).toBe(VIDEO_ID)

  const toggle = page.getByRole('switch', { name: 'Autoplay' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yt-client:settings') ?? '{}').autoplay)).toBe(true)
})

test('a playlist moves on to its next entry', async ({ page }) => {
  test.setTimeout(300_000)
  const list = `RD${VIDEO_ID}`
  await page.goto(`/watch?v=${VIDEO_ID}&list=${list}&index=1`)
  const video = await startPlayback(page)
  const second = page.locator('section[aria-label="Playlist queue"] li').nth(1).locator('a')
  await expect(second).toBeVisible({ timeout: 60_000 })
  const expected = videoIdOf((await second.getAttribute('href'))!)

  // no wait on `ended`: the queue moves on the moment it is set, replacing the video element
  await seekToEnd(video)
  await expect.poll(() => {
    const url = new URL(page.url())
    return [url.searchParams.get('v'), url.searchParams.get('list'), url.searchParams.get('index')]
  }, { timeout: 30_000 }).toEqual([expected, list, '2'])
})

test('the miniplayer moves on in place, without leaving the page', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)

  await page.evaluate(() => {
    history.pushState(null, '', '/settings')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 30_000 })
  const dockTitle = page.locator('.dock-title')
  await expect(dockTitle).toBeVisible()

  await runToEnd(video)
  await expect.poll(
    async () => videoIdOf((await dockTitle.getAttribute('href'))!),
    { timeout: 60_000, message: 'the miniplayer did not move on' },
  ).not.toBe(VIDEO_ID)
  expect(new URL(page.url()).pathname).toBe('/settings')
  await startPlayback(page)
})

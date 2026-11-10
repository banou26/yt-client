import type { Page } from '@playwright/test'

import { expect, laneOrigin, plainTest, test } from './test'

const HARNESS = '/tests/browser/fixtures/home-harness.tsx'

test('a link click reads Home anew, and going back to it shows the feed it showed', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 90_000 })
  const home = page.locator('[data-cached-home-harness]')
  const first = home.locator('a[href^="/watch?v="]').first()
  // the harness's first import can add a dependency for the dev server to bundle, which reloads the page under it
  await expect(async () => {
    if (await home.count() === 0) {
      await page.evaluate(async (path) => (await import(path) as typeof import('./fixtures/home-harness')).mountCachedHome(), HARNESS)
    }
    await expect(first).toHaveAttribute('href', '/watch?v=video-1', { timeout: 15_000 })
  }).toPass({ timeout: 120_000 })
  const reopen = (how: 'pushState' | 'popstate') => page.evaluate(async ({ path, how }) =>
    (await import(path) as typeof import('./fixtures/home-harness')).reopenHome(how), { path: HARNESS, how })

  await reopen('pushState')
  await expect(first).toHaveAttribute('href', '/watch?v=video-2')
  await reopen('popstate')
  await expect(first).toHaveAttribute('href', '/watch?v=video-2')
  // the third read answers video-3 only if going back read nothing
  await reopen('pushState')
  await expect(first).toHaveAttribute('href', '/watch?v=video-3')
})

const playedSeconds = (page: Page) => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0)

const watchTwoThenOpenHome = async (page: Page, origin: string) => {
  await page.goto(`${origin}/`)
  await expect(page.getByRole('heading', { name: 'Try searching to get started' })).toBeVisible({ timeout: 90_000 })
  for (const [videoId, seconds] of [['jNQXAC9IVRw', 5], ['kJQP7kiw5Fk', 20]] as const) {
    await page.evaluate((path) => {
      history.pushState(null, '', path)
      dispatchEvent(new PopStateEvent('popstate'))
    }, `/watch?v=${videoId}`)
    await expect(page).toHaveURL(new RegExp(`v=${videoId}`))
    await expect.poll(() => playedSeconds(page), { timeout: 90_000 }).toBeGreaterThan(seconds)
  }
  await page.getByRole('link', { name: 'yt-client home' }).click()
  const videos = page.locator('main a[href^="/watch"]')
  await expect.poll(() => videos.count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(10)
  await expect(page.getByRole('heading', { name: 'Try searching to get started' })).toHaveCount(0)
  return videos
}

plainTest('a signed-out Home fills once two videos were watched, and going back to it keeps its feed', async ({ page, baseURL }) => {
  plainTest.setTimeout(300_000)
  const origin = laneOrigin(baseURL)
  const videos = await watchTwoThenOpenHome(page, origin)

  const firstVideos = () => videos.evaluateAll(anchors => [...new Set(anchors.map(anchor => anchor.getAttribute('href')))].slice(0, 6))
  const shown = await firstVideos()
  await page.evaluate(() => scrollTo(0, 1000))
  const href = await videos.evaluateAll(anchors => anchors.find((anchor) => {
    const { top, bottom } = anchor.getBoundingClientRect()
    return top > 150 && bottom < innerHeight - 50
  })?.getAttribute('href'))
  const clicked = page.locator(`main a[href="${href}"]`).first()
  await clicked.click()
  await expect(page).toHaveURL(/\/watch\?v=/)
  await page.goBack()
  await expect(page).toHaveURL(`${origin}/`)
  await expect.poll(firstVideos).toEqual(shown)
  await expect(clicked).toBeInViewport()
})

plainTest('through the relay too, a signed-out Home fills once two videos were watched', async ({ page, baseURL }) => {
  plainTest.setTimeout(300_000)
  await page.addInitScript(() => localStorage.setItem('yt-client:step:direct', '0'))
  await watchTwoThenOpenHome(page, laneOrigin(baseURL))
  await expect(page.locator('html')).toHaveAttribute('data-yt-direct', 'off')
})

import type { Page } from '@playwright/test'

import { expect, laneOrigin, plainTest as test } from './test'

const playedSeconds = (page: Page) => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0)

test('a signed-out Home fills once two videos were watched, opened again from the logo', async ({ page, baseURL }) => {
  test.setTimeout(300_000)
  await page.goto(`${laneOrigin(baseURL)}/`)
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
  await expect.poll(() => page.locator('main a[href^="/watch"]').count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(10)
  await expect(page.getByRole('heading', { name: 'Try searching to get started' })).toHaveCount(0)
})

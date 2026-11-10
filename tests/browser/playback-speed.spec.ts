import type { Page } from '@playwright/test'

import { expect, test } from './test'

/* The Playback speed panel against the live source: `dQw4w9WgXcQ` is a 213 s video. */

const VIDEO = '/watch?v=dQw4w9WgXcQ'

const startPlayback = async (page: Page) => {
  await page.goto(VIDEO)
  const video = page.locator('video')
  await expect.poll(
    () => video.evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 120_000, message: 'playback did not start' },
  ).toBeGreaterThan(1)
  // Shaka holds the rate at 0 while a seek buffers and then restores its own, which can overwrite a rate set meanwhile
  await expect.poll(() => video.evaluate((element) => {
    const player = element as HTMLVideoElement
    return !player.seeking && player.readyState >= 3
  })).toBe(true)
  return () => video.evaluate(element => (element as HTMLVideoElement).playbackRate)
}

const openSettings = async (page: Page) => {
  await page.locator('[data-player-root]').hover()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  return page.getByRole('menu', { name: 'Player settings' }).getByRole('menuitem', { name: /^Playback speed/ })
}

const speedSlider = (page: Page) => page.getByRole('slider', { name: 'Playback speed', exact: true })

test('the speed slider sets 1.1x, which the video and the Settings row follow', async ({ page }) => {
  test.setTimeout(300_000)
  const rate = await startPlayback(page)
  const row = await openSettings(page)
  await expect(row).toHaveText('Playback speedNormal')
  await row.click()

  const panel = page.getByRole('menu', { name: 'Playback speed' })
  const slider = speedSlider(page)
  await expect(panel.getByText('1.00x', { exact: true })).toBeVisible()
  await expect(slider).toHaveValue('1')
  await slider.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(panel.getByText('1.10x', { exact: true })).toBeVisible()
  await expect.poll(rate).toBe(1.1)

  // as on youtube.com, the left arrow goes back to the settings rather than stepping down, and the row reads 1.1
  await page.keyboard.press('ArrowLeft')
  await expect(panel).toBeHidden()
  await expect(row).toHaveText('Playback speed1.1')
  expect(await rate()).toBe(1.1)

  // > is 0.25 faster than the speed, not the next chip
  await page.keyboard.press('Escape')
  await page.keyboard.press('Shift+Period')
  await expect.poll(rate).toBe(1.35)
  await expect(page.locator('[data-bezel="speed"]')).toContainText('1.35x')

  await (await openSettings(page)).click()
  await expect(panel.getByText('1.35x', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '2.0', exact: true }).click()
  await expect.poll(rate).toBe(2)
  const increase = panel.getByRole('button', { name: 'Increase playback speed 0.05', exact: true })
  await increase.click()
  await expect(panel.getByText('2.00x', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Decrease playback speed 0.05', exact: true }).click()
  await expect.poll(rate).toBe(1.95)
  await panel.getByRole('button', { name: '1.0', exact: true }).click()
  await expect.poll(rate).toBe(1)
  await panel.getByRole('button', { name: 'Back to previous menu', exact: true }).click()
  await expect(row).toHaveText('Playback speedNormal')
})

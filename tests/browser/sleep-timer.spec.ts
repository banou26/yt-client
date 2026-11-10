import type { Page } from '@playwright/test'

import { expect, plainTest as test } from './test'

/* The Sleep timer against the live source: `dQw4w9WgXcQ` is a 213 s video with a related list. Playwright's clock,
   installed once the video plays, stands in for the minutes. */

const VIDEO = '/watch?v=dQw4w9WgXcQ'

const startPlayback = async (page: Page) => {
  await page.goto(VIDEO)
  await page.waitForFunction(() => performance.getEntriesByName('yt:first-frame', 'mark').length > 0, null, { timeout: 120_000 })
  return page.locator('video')
}

const paused = (page: Page) => page.locator('video').evaluate(video => (video as HTMLVideoElement).paused)

const openSettings = async (page: Page) => {
  await page.locator('[data-player-root]').hover()
  await page.getByRole('button', { name: 'Settings' }).click()
  return page.getByRole('menu', { name: 'Player settings' })
}

const sleepPanel = (page: Page) => page.getByRole('menu', { name: 'Sleep timer' })

test('the Sleep timer counts down under Subtitles and pauses the video when its minutes are up', async ({ page }) => {
  test.setTimeout(300_000)
  await startPlayback(page)
  await page.clock.install()

  const settings = await openSettings(page)
  await expect(settings.getByRole('menuitem')).toHaveText([/^Subtitles/, 'Sleep timerOff', /^Playback speed/, /^Quality/])
  await settings.getByRole('menuitem', { name: /^Sleep timer/ }).click()
  await expect(sleepPanel(page).getByRole('menuitem')).toHaveText([
    'Off',
    '10 minutes',
    '15 minutes',
    '20 minutes',
    '30 minutes',
    '45 minutes',
    '60 minutes',
    /^End of video\d+ min$/,
  ])

  // a pick goes back to the settings, as on youtube.com
  await sleepPanel(page).getByRole('menuitem', { name: '10 minutes' }).click()
  const row = page.getByRole('menu', { name: 'Player settings' }).getByRole('menuitem', { name: /^Sleep timer/ })
  await expect(row).toHaveText('Sleep timer10 min left')
  await page.keyboard.press('Escape')

  await page.clock.fastForward('05:00')
  await openSettings(page)
  await expect(row).toHaveText('Sleep timer5 min left')
  await page.keyboard.press('Escape')
  expect(await paused(page)).toBe(false)

  await page.clock.fastForward('05:01')
  const timesUp = page.getByRole('dialog', { name: 'Time\'s up' })
  await expect(timesUp).toBeVisible()
  expect(await paused(page)).toBe(true)

  // Add time opens the timer's own panel, off now that it has ended
  await timesUp.getByRole('button', { name: 'Add time' }).click()
  await expect(timesUp).toBeHidden()
  await expect(sleepPanel(page)).toBeVisible()
  await sleepPanel(page).getByRole('menuitem', { name: '15 minutes' }).click()
  await expect(row).toHaveText('Sleep timer15 min left')
})

const videoIdOf = (url: string) => new URL(url, 'http://localhost').searchParams.get('v')

// End of video set, then played out: Time's up opens on the ended video
const sleepAtEnd = async (page: Page) => {
  const video = await startPlayback(page)
  await page.clock.install()
  const settings = await openSettings(page)
  await settings.getByRole('menuitem', { name: /^Sleep timer/ }).click()
  await sleepPanel(page).getByRole('menuitem', { name: /^End of video/ }).click()
  await expect(settings.getByRole('menuitem', { name: /^Sleep timer/ })).toHaveText(/^Sleep timer\d+ min left$/)
  await page.keyboard.press('Escape')

  await video.evaluate((element) => {
    const player = element as HTMLVideoElement
    player.currentTime = player.duration - 1.5
    void player.play().catch(() => {})
  })
  const timesUp = page.getByRole('dialog', { name: 'Time\'s up' })
  await expect(timesUp).toBeVisible({ timeout: 60_000 })
  expect(await video.evaluate(element => (element as HTMLVideoElement).ended)).toBe(true)
  await expect(timesUp.getByRole('button')).toHaveText(['Add time', 'Close'])
  return timesUp
}

const countdown = (page: Page) => page.locator('[data-end-screen="countdown"]')

test('End of video holds the next video while Time\'s up is open, and Close lets the countdown run', async ({ page }) => {
  test.setTimeout(300_000)
  const timesUp = await sleepAtEnd(page)

  // youtube.com's countdown is 3 s, so by now it would have moved on
  await page.clock.fastForward('00:10')
  await expect(countdown(page)).toHaveCount(0)
  expect(videoIdOf(page.url())).toBe('dQw4w9WgXcQ')

  await timesUp.getByRole('button', { name: 'Close' }).click()
  await expect(timesUp).toBeHidden()
  await expect(countdown(page)).toBeVisible()
  const next = videoIdOf((await countdown(page).locator('a[href^="/watch"]').getAttribute('href'))!)
  await page.clock.fastForward('00:04')
  await expect.poll(() => videoIdOf(page.url()), { timeout: 30_000 }).toBe(next)
})

test('Escape on Time\'s up at the end of the video cancels the countdown and keeps the suggestions', async ({ page }) => {
  test.setTimeout(300_000)
  const timesUp = await sleepAtEnd(page)

  await page.keyboard.press('Escape')
  await expect(timesUp).toBeHidden()
  await expect(page.locator('[data-end-screen="suggestions"]')).toBeVisible()
  await page.clock.fastForward('00:10')
  await expect(countdown(page)).toHaveCount(0)
  expect(videoIdOf(page.url())).toBe('dQw4w9WgXcQ')
})

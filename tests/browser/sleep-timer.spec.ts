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

// youtube.com's miniplayer has no Time's up (measured signed out on 2026-11-10), only a toast when the timer runs out there
test('in the miniplayer the timer\'s end pauses the video with a toast, and Escape then closes the miniplayer', async ({ page }) => {
  test.setTimeout(300_000)
  await startPlayback(page)
  await page.clock.install()
  const settings = await openSettings(page)
  await settings.getByRole('menuitem', { name: /^Sleep timer/ }).click()
  await sleepPanel(page).getByRole('menuitem', { name: '10 minutes' }).click()
  await page.keyboard.press('Escape')
  await page.locator('main h1').click()
  await page.keyboard.press('i')
  const mini = page.getByRole('complementary', { name: 'Miniplayer' })
  await expect(mini).toBeVisible({ timeout: 30_000 })

  await page.clock.fastForward('10:01')
  await expect(page.getByRole('status').getByText('Sleep timer has been turned off', { exact: true })).toBeVisible()
  expect(await paused(page)).toBe(true)
  await expect(page.getByRole('dialog', { name: 'Time\'s up' })).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(mini).toHaveCount(0)
  await expect(page.locator('video')).toHaveCount(0)
})

const videoIdOf = (url: string) => new URL(url, 'http://localhost').searchParams.get('v')

const playerIsFullscreen = (page: Page) =>
  page.evaluate(() => document.fullscreenElement?.hasAttribute('data-player-root') ?? false)

// End of video set, then played out: Time's up opens on the ended video
const sleepAtEnd = async (page: Page, { fullscreen = false } = {}) => {
  const video = await startPlayback(page)
  await page.clock.install()
  const settings = await openSettings(page)
  await settings.getByRole('menuitem', { name: /^Sleep timer/ }).click()
  await sleepPanel(page).getByRole('menuitem', { name: /^End of video/ }).click()
  await expect(settings.getByRole('menuitem', { name: /^Sleep timer/ })).toHaveText(/^Sleep timer\d+ min left$/)
  await page.keyboard.press('Escape')
  if (fullscreen) {
    // a real key press from the page, since requestFullscreen needs the user's gesture
    await page.locator('main h1').click()
    await page.keyboard.press('f')
    await expect.poll(() => playerIsFullscreen(page)).toBe(true)
  }

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

test('in full screen End of video holds the next video, and Time\'s up shows over the player', async ({ page }) => {
  test.setTimeout(300_000)
  const timesUp = await sleepAtEnd(page, { fullscreen: true })
  expect(await timesUp.evaluate(dialog => document.fullscreenElement?.contains(dialog) ?? false)).toBe(true)
  // the countdown draws with the ended video, before Time's up opens, so none now is the hold
  expect(await countdown(page).count()).toBe(0)

  // full screen plays the next video in place, so the address stays and only the ended video tells
  await page.clock.fastForward('00:10')
  await expect(countdown(page)).toHaveCount(0)
  expect(await page.locator('video').evaluate(element => (element as HTMLVideoElement).ended)).toBe(true)
  expect(await playerIsFullscreen(page)).toBe(true)

  // v opens the grid, but not behind the dialog
  await page.keyboard.press('v')
  await timesUp.getByRole('button', { name: 'Close' }).click()
  await expect(timesUp).toBeHidden()
  await expect(countdown(page)).toBeVisible()
  await expect(page.locator('[data-player-root]').getByRole('list', { name: 'More videos' })).toHaveCount(0)
  expect(await playerIsFullscreen(page)).toBe(true)
})

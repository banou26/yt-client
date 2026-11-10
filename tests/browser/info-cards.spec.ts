import type { Locator, Page } from '@playwright/test'

import { expect, plainTest as test } from './test'

/* `kJQP7kiw5Fk` carries three info cards, whose teasers slide in at 15, 30 and 45 s and stay 6 s, or while the
   pointer is on them (measured on youtube.com signed out, 2026-11-10). youtube.com draws a teaser 12 px from the
   player's right and 16.5 px from its top, 31 px tall, and the "i" that opens the cards 36 px square, 8 px from the
   top, with the controls, and not once the video ends; a seek past a teaser's start shows none. The cards are the
   ones its expanded description lists under the channel card, which on the page it glides to 24 px above the bottom,
   and in full screen the "i" opens that description beside the video, its text cut at 20 lines (400 px) behind
   ...more. Its miniplayer shows neither, and its end screen's Hide toggle sits 48 px from the top, under the "i". */

const VIDEO_ID = 'kJQP7kiw5Fk'
const FIRST = 'Listen to Luis\' new single'
const SECOND = 'Becky G - Glitch | Official Live Performance'

const video = (page: Page) => page.locator('[data-player-root] video')

const currentTime = (page: Page) => video(page).evaluate(element => (element as HTMLVideoElement).currentTime)

const seek = (page: Page, seconds: number) => video(page).evaluate((element, seconds) => {
  (element as HTMLVideoElement).currentTime = seconds
}, seconds)

const playFrom = async (page: Page, seconds: number) => {
  await page.goto(`/watch?v=${VIDEO_ID}&t=${seconds}`)
  await expect.poll(() => currentTime(page), { timeout: 120_000, message: 'playback did not start' }).toBeGreaterThan(seconds)
}

// a box against the player surface's top right corner
const corner = async (page: Page, locator: Locator) => {
  const surface = (await page.locator('[data-player-surface]').boundingBox())!
  const box = (await locator.boundingBox())!
  return { right: surface.x + surface.width - box.x - box.width, top: box.y - surface.y, width: box.width, height: box.height }
}

// the controls fade after 2.5 s still, so the pointer wakes them first
const wake = async (page: Page) => {
  const surface = (await page.locator('[data-player-surface]').boundingBox())!
  await page.mouse.move(surface.x + 200, surface.y + 200)
  await page.mouse.move(surface.x + 240, surface.y + 220)
}

const showCards = (page: Page) => page.getByRole('button', { name: 'Show cards', exact: true })

test('slides a teaser in at its time and collapses it into the corner, where the "i" opens the cards, and shows none after a seek past one', async ({ page }) => {
  test.setTimeout(300_000)
  await playFrom(page, 12)

  const teaser = page.getByRole('button', { name: FIRST, exact: true })
  await expect(teaser).toBeVisible({ timeout: 30_000 })
  const shownAt = Date.now()
  expect(await currentTime(page)).toBeGreaterThanOrEqual(15)
  await expect.poll(async () => {
    const { right, top, height } = await corner(page, teaser.locator('..'))
    return [Math.round(right), Math.round(top * 2) / 2, Math.round(height)]
  }).toEqual([12, 16.5, 31])
  await wake(page)
  await expect(showCards(page)).toBeHidden()

  await expect(teaser).toBeHidden({ timeout: 10_000 })
  expect(Date.now() - shownAt).toBeGreaterThan(6_000)
  await wake(page)
  await expect(showCards(page)).toBeVisible()
  expect(await corner(page, showCards(page))).toEqual({ right: 12, top: 8, width: 36, height: 36 })

  await showCards(page).click()
  const channel = page.getByRole('region', { name: 'Channel', exact: true })
  const card = channel.getByRole('link', { name: `2:02 ${SECOND} by BeckyGVEVO`, exact: true })
  await expect(card).toBeInViewport()
  await expect.poll(async () => {
    const box = (await channel.boundingBox())!
    return Math.round(page.viewportSize()!.height - box.y - box.height)
  }).toBe(24)
  await expect(card).toHaveAttribute('href', '/watch?v=Clor87IPcBg')
  const link = channel.getByRole('link', { name: 'Luis Fonsi - Por Isso Que Eu Bebo Listen Here', exact: true })
  await expect(link).toHaveAttribute('href', 'https://luisfonsi.lnk.to/PorIssoQueEuBeboYC')
  await expect(link).toHaveAttribute('target', '_blank')
  expect(await video(page).evaluate(element => (element as HTMLVideoElement).paused)).toBe(false)

  await seek(page, 26)
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThan(27)
  await seek(page, 32)
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThan(33)
  // a count, not toHaveCount(0), which would wait out a teaser shown by mistake
  expect(await page.getByRole('button', { name: SECOND, exact: true }).count()).toBe(0)
})

test('holds a teaser under the pointer and closes it, opens the description beside the video in full screen, and shows no cards in the miniplayer', async ({ page }) => {
  test.setTimeout(300_000)
  await playFrom(page, 28)

  const teaser = page.getByRole('button', { name: SECOND, exact: true })
  await expect(teaser).toBeVisible({ timeout: 30_000 })
  await teaser.hover()
  await page.waitForTimeout(7_000)
  await expect(teaser).toBeVisible()
  await teaser.locator('..').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(teaser).toBeHidden({ timeout: 1_000 })

  await page.locator('main h1').click()
  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute('data-player-root') ?? false)).toBe(true)
  await expect(async () => {
    await wake(page)
    await showCards(page).click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  const panel = page.getByRole('complementary', { name: 'Description', exact: true })
  await expect(panel.getByRole('link', { name: `2:02 ${SECOND} by BeckyGVEVO`, exact: true })).toBeAttached()
  expect(Math.round((await panel.boundingBox())!.width)).toBe(320)
  const more = panel.getByRole('button', { name: '...more', exact: true })
  const less = panel.getByRole('button', { name: 'Show less', exact: true })
  await expect(more).toBeVisible()
  expect(Math.round((await more.locator('..').boundingBox())!.height)).toBe(400)
  await expect(less).toHaveCount(0)
  await more.click()
  await expect(more).toHaveCount(0)
  expect((await less.locator('xpath=preceding-sibling::*[1]').boundingBox())!.height).toBeGreaterThan(420)
  await less.click()
  await expect(more).toBeVisible()
  await panel.getByRole('button', { name: 'Close description', exact: true }).click()
  await expect(panel).toBeHidden()

  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await seek(page, 43)
  await page.keyboard.press('i')
  await expect(page.getByRole('complementary', { name: 'Miniplayer', exact: true })).toBeVisible()
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThan(46)
  await expect(page.getByRole('button', { name: 'WATCH: New video by Luis Fonsi', exact: true })).toHaveCount(0)
  await expect(showCards(page)).toHaveCount(0)
})

test('moves the end screen\'s Hide toggle under the "i", and hides the "i" once the video ends', async ({ page }) => {
  test.setTimeout(300_000)
  await playFrom(page, 268)

  const hide = page.getByRole('button', { name: 'Hide endscreen cards', exact: true })
  await expect(hide).toBeVisible({ timeout: 10_000 })
  await expect(async () => {
    await wake(page)
    await expect(showCards(page)).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 5_000 })
  expect(await corner(page, showCards(page))).toEqual({ right: 12, top: 8, width: 36, height: 36 })
  expect(await corner(page, hide)).toMatchObject({ right: 12, top: 48 })

  await expect.poll(() => video(page).evaluate(element => (element as HTMLVideoElement).ended), { timeout: 30_000 }).toBe(true)
  await wake(page)
  await page.waitForTimeout(500)
  expect(await showCards(page).isVisible()).toBe(false)
})

test('offers ...more in the full screen description only on a text longer than its 20 lines', async ({ page }) => {
  await page.goto('/settings')
  await page.evaluate(async () => {
    const harness = '/tests/browser/fixtures/description-harness.tsx'
    const { mountPanelDescription } = await import(harness) as { mountPanelDescription: (lines: number) => void }
    mountPanelDescription(20)
    mountPanelDescription(21)
  })
  const fits = page.locator('[data-description-harness]').first()
  const runs = page.locator('[data-description-harness]').last()
  await expect(runs.getByRole('button', { name: '...more', exact: true })).toBeVisible()
  await expect(fits.getByRole('button', { name: '...more', exact: true })).toHaveCount(0)
  for (const box of [fits, runs]) {
    expect(Math.round((await box.getByText(/^Line 1\s+Line 2\s/).boundingBox())!.height)).toBe(400)
  }
})

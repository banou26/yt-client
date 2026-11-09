import type { Page } from '@playwright/test'

import { expect, plainTest as test } from './test'

// a 3:54 premiere whose chat replay runs from its start to past its end (read 2026-11-10)
const PREMIERE = 'fOT0BUpITw8'

// every line's author name carries its timestampText, the point of the video it was said at ('2:54', '-0:03')
const lineTimes = (page: Page) =>
  page.getByRole('region', { name: 'Chat replay', exact: true }).locator('.row .who[title]').evaluateAll((names) =>
    names.map((name) => {
      const stamp = name.getAttribute('title') ?? ''
      const seconds = stamp.replace('-', '').split(':').reduce((total, part) => total * 60 + Number(part), 0)
      return stamp.startsWith('-') ? -seconds : seconds
    }))

const playhead = (page: Page) =>
  page.locator('[data-player-root] video').evaluate((video) => (video as HTMLVideoElement).currentTime)

const seek = (page: Page, seconds: number) =>
  page.locator('[data-player-root] video').evaluate((video, to) => {
    (video as HTMLVideoElement).currentTime = to
  }, seconds)

// lines are shown, none said before `from` or after the playhead, and the newest within the 15 s before the playhead
const following = async (page: Page, from: number) => {
  const times = await lineTimes(page)
  const at = await playhead(page)
  const newest = Math.max(...times)
  return times.length > 0 && Math.min(...times) >= from && newest <= at + 1 && newest >= at - 15
}

test('a past premiere replays its chat in step with the video, through seeks back and forth', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${PREMIERE}`)
  const open = page.getByRole('button', { name: 'Open panel' })
  await open.click({ timeout: 120_000 })
  const panel = page.getByRole('region', { name: 'Chat replay', exact: true })
  await expect(panel.getByRole('button', { name: 'Top chat replay' })).toBeVisible()
  await expect(open).toBeDisabled()

  await expect.poll(() => playhead(page), { timeout: 120_000, message: 'playback did not start' }).toBeGreaterThan(5)
  await expect.poll(async () => (await lineTimes(page)).length, { timeout: 60_000 }).toBeGreaterThan(0)
  const early = await lineTimes(page)
  expect(Math.max(...early)).toBeLessThanOrEqual(await playhead(page) + 1)

  await seek(page, 180)
  // youtube.com skips the chat between the two points rather than paging through it to catch up
  const skipped: number[] = []
  await expect.poll(async () => {
    skipped.push(...(await lineTimes(page)).filter((time) => time > 40 && time < 165))
    return following(page, 100)
  }, { timeout: 60_000, intervals: [200], message: 'the lines did not move to 3:00' }).toBe(true)
  expect(skipped).toEqual([])
  const ahead = Math.max(...await lineTimes(page))

  await seek(page, 30)
  await expect.poll(() => following(page, -Infinity), {
    timeout: 60_000,
    message: 'the lines did not move back to 0:30',
  }).toBe(true)
  expect(Math.max(...await lineTimes(page))).toBeLessThan(ahead)

  // and they keep following the playhead from there
  const before = Math.max(...await lineTimes(page))
  await expect.poll(async () => Math.max(...await lineTimes(page)), { timeout: 30_000 }).toBeGreaterThan(before + 3)
  expect(Math.max(...await lineTimes(page))).toBeLessThanOrEqual(await playhead(page) + 1)

  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(panel).toHaveCount(0)
  await expect(open).toBeEnabled()
})

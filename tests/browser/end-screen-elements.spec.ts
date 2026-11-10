import type { Page } from '@playwright/test'

import { expect, plainTest as test } from './test'

/* `g6Die8gVFn0` (779 s, a 2:1 picture) carries a channel and two videos from 774.1 s to its end (measured on youtube.com
   2026-11-10). Each spec reads its numbers from the page, since a creator can move the elements. */

const VIDEO_ID = 'g6Die8gVFn0'

const startPlayback = async (page: Page) => {
  const video = page.locator('video')
  await expect(video).toBeVisible({ timeout: 60_000 })
  await expect.poll(
    () => video.evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 120_000, message: 'playback did not start' },
  ).toBeGreaterThan(1)
  return video
}

// each element's box against the picture the video draws (object-fit: contain), as fractions of the picture
const layout = (page: Page) => page.evaluate(() => {
  const video = document.querySelector('video')!
  const box = video.getBoundingClientRect()
  const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight)
  const picture = {
    left: box.left + (box.width - video.videoWidth * scale) / 2,
    top: box.top + (box.height - video.videoHeight * scale) / 2,
    width: video.videoWidth * scale,
    height: video.videoHeight * scale,
  }
  const elements = [...document.querySelectorAll<HTMLElement>('[data-end-screen="elements"] .element')]
    .filter(element => getComputedStyle(element).visibility === 'visible')
    .map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        label: element.querySelector('[aria-label]')?.getAttribute('aria-label') ?? element.getAttribute('aria-label')!,
        left: (rect.left - picture.left) / picture.width,
        top: (rect.top - picture.top) / picture.height,
        width: rect.width / picture.width,
        height: rect.height,
        right: (rect.right - picture.left) / picture.width,
        bottom: (rect.bottom - picture.top) / picture.height,
        whole: [rect.left - box.left, rect.top - box.top, rect.width, rect.height].every(value => Number.isInteger(value)),
      }
    })
  return { picture, elements }
})

test('shows the creator\'s elements over the last seconds, scaled to the picture, and opens a video', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  await video.evaluate((element) => {
    const player = element as HTMLVideoElement
    player.currentTime = 771
    void player.play().catch(() => {})
  })

  const videos = page.getByRole('link', { name: /, video$/ })
  const channel = page.getByRole('link', { name: /, channel$/ })
  await expect(videos.first()).toBeHidden()
  await expect(videos.first()).toBeVisible({ timeout: 30_000 })
  await expect(videos).toHaveCount(2)
  await expect(videos.nth(1)).toBeVisible()
  await expect(channel).toBeVisible()
  expect(await video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(774)

  const shown = await layout(page)
  expect(shown.elements).toHaveLength(3)
  for (const element of shown.elements) {
    expect(element.whole, `${element.label} sits at whole pixels`).toBe(true)
    expect(element.left).toBeGreaterThanOrEqual(-0.01)
    expect(element.right).toBeLessThanOrEqual(1.01)
    expect(element.top).toBeGreaterThanOrEqual(-0.01)
    expect(element.bottom).toBeLessThanOrEqual(1.01)
  }

  // theater widens the picture, and once it settles each element keeps its place and size in it to the pixel
  await page.keyboard.press('t')
  await expect(async () => {
    const wide = await layout(page)
    expect(wide.picture.width).toBeGreaterThan(shown.picture.width + 100)
    for (const element of shown.elements) {
      const same = wide.elements.find(candidate => candidate.label === element.label)!
      expect(Math.abs(same.left - element.left) * wide.picture.width, element.label).toBeLessThanOrEqual(2)
      expect(Math.abs(same.width - element.width) * wide.picture.width, element.label).toBeLessThanOrEqual(2)
      expect(Math.abs(same.top - element.top) * wide.picture.height, element.label).toBeLessThanOrEqual(2)
    }
  }).toPass({ timeout: 10_000 })
  await page.keyboard.press('t')
  await expect.poll(async () => (await layout(page)).picture.width).toBe(shown.picture.width)

  await page.getByRole('button', { name: 'Hide endscreen cards' }).click()
  await expect(videos.first()).toBeHidden()
  await expect(channel).toBeHidden()
  await page.getByRole('button', { name: 'Show endscreen cards' }).click()
  await expect(videos.first()).toBeVisible()

  // the upper tile, clear of the control bar, clicked at whole pixels
  const tiles = await Promise.all([0, 1].map(async index => ({ index, box: (await videos.nth(index).boundingBox())! })))
  const upper = tiles.sort((a, b) => a.box.y - b.box.y)[0]!
  const href = await videos.nth(upper.index).getAttribute('href')
  const target = new URL(href!, 'http://localhost').searchParams.get('v')
  expect(target).toMatch(/^[\w-]{11}$/)
  await page.mouse.click(Math.round(upper.box.x + upper.box.width / 2), Math.round(upper.box.y + upper.box.height / 2))
  await expect.poll(() => new URL(page.url()).searchParams.get('v'), { timeout: 30_000 }).toBe(target)
  await startPlayback(page)
})

import type { Page } from '@playwright/test'

import { expect, plainTest as test } from './test'

/* `g6Die8gVFn0` (779 s, a 2:1 picture) carries a channel and two videos from 774.1 s to its end (measured on youtube.com
   2026-11-10). Each spec reads its numbers from the page, since a creator can move the elements. In youtube.com's
   miniplayer the elements show without Hide, under the hover wash, where a click plays or pauses the video. */

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

const paused = (page: Page) => page.locator('video').evaluate(element => (element as HTMLVideoElement).paused)

// the tile nearer the top, clear of the control bar, at the whole pixel nearest its center
const upperTileCenter = async (page: Page) => {
  const videos = page.getByRole('link', { name: /, video$/ })
  const tiles = await Promise.all([0, 1].map(async index => ({ index, box: (await videos.nth(index).boundingBox())! })))
  const { index, box } = tiles.sort((a, b) => a.box.y - b.box.y)[0]!
  return { tile: videos.nth(index), x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
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

  const upper = await upperTileCenter(page)
  const href = await upper.tile.getAttribute('href')
  const target = new URL(href!, 'http://localhost').searchParams.get('v')
  expect(target).toMatch(/^[\w-]{11}$/)
  await page.mouse.click(upper.x, upper.y)
  await expect.poll(() => new URL(page.url()).searchParams.get('v'), { timeout: 30_000 }).toBe(target)
  await startPlayback(page)
})

test('shows the elements in the miniplayer without Hide, where a click on a tile plays the video', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  await page.evaluate(() => {
    history.pushState(null, '', '/settings')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  const mini = page.getByRole('complementary', { name: 'Miniplayer' })
  await expect(mini).toBeVisible({ timeout: 30_000 })
  const title = mini.locator('.dock-title')
  await expect(title).not.toBeEmpty({ timeout: 30_000 })
  const name = (await title.textContent())!
  await video.evaluate((element) => {
    const player = element as HTMLVideoElement
    player.pause()
    player.currentTime = 775
  })

  const videos = page.getByRole('link', { name: /, video$/ })
  await expect(videos).toHaveCount(2)
  await expect(videos.first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: /, channel$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /endscreen cards$/ })).toHaveCount(0)
  expect(await paused(page)).toBe(true)

  const upper = await upperTileCenter(page)
  await page.mouse.move(upper.x, upper.y)
  await page.mouse.click(upper.x, upper.y)
  await expect.poll(() => paused(page), { timeout: 10_000 }).toBe(false)
  expect(await video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(774)
  await expect(title).toHaveText(name)
  expect(new URL(page.url()).pathname).toBe('/settings')
})

import type { Locator, Page } from '@playwright/test'

import { expect, hideFknNotice, test } from './test'

/* The inline preview must never paint over a thumbnail it cannot yet replace: its root is an opaque black box mounted the moment the pointer lands.
   Sampled continuously because the defect is a flash, which a before-and-after assertion passes straight through. */

test('keeps the thumbnail until the preview has a frame, then fades it in', async ({ page }) => {
  test.setTimeout(240_000)

  await page.goto('/results?search_query=blender')
  const channelLink = page.locator('a[href^="/channel/"]').first()
  await expect(channelLink).toBeVisible({ timeout: 120_000 })
  await page.goto((await channelLink.getAttribute('href')) ?? '/')
  const cards = page.locator('article').filter({ has: page.locator('a.thumb') })
  await expect(cards.first().locator('a.thumb')).toBeVisible({ timeout: 120_000 })
  await page.waitForTimeout(3000)

  await page.evaluate(() => {
    const w = window as unknown as { __samples: { opacity: number, painted: boolean, ready: number }[] }
    w.__samples = []
    const timer = setInterval(() => {
      const video = document.querySelector('article video') as HTMLVideoElement | null
      const root = video?.parentElement
      if (!root || !video) return
      w.__samples.push({
        opacity: Number(getComputedStyle(root).opacity),
        painted: root.hasAttribute('data-painted'),
        ready: video.readyState,
      })
      if (w.__samples.length > 600) clearInterval(timer)
    }, 40)
  })

  await cards.first().hover()
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as { __samples: { painted: boolean }[] }).__samples.some(s => s.painted)),
      { timeout: 90_000 },
    )
    .toBe(true)
  await page.waitForTimeout(1000)

  const samples = await page.evaluate(() =>
    (window as unknown as { __samples: { opacity: number, painted: boolean, ready: number }[] }).__samples)

  const tooEarly = samples.filter(sample => sample.opacity > 0.05 && sample.ready < 2)
  expect(samples.length, 'no samples were taken, so nothing was proven').toBeGreaterThan(3)
  expect(tooEarly, `the preview was visible with no decodable frame: ${JSON.stringify(tooEarly.slice(0, 3))}`)
    .toHaveLength(0)
  expect(samples.some(sample => sample.painted && sample.opacity > 0.95)).toBe(true)
})

/* With navigator.webdriver true every far seek walls, on youtube.com's own previews as much as on these (measured
   2026-11-10), so the specs that seek run as a plain Chrome, the same launch as live.spec.ts. */
const plain = test.extend<object, object>({
  userAgent: async ({ browser }, use) => {
    await use(`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`)
  },
  page: async ({ page }, use) => {
    await hideFknNotice(page)
    await use(page)
  },
  browser: [async ({ playwright, browserName, headless, launchOptions }, use) => {
    const browser = await playwright[browserName].launch({
      ...launchOptions,
      headless,
      args: [...(launchOptions.args ?? []), '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    })
    await use(browser)
    await browser.close()
  }, { scope: 'worker' }],
})

// Blender Guru's 4 h donut course, with English captions: long enough that every 5% of the bar is minutes. Signed-out
// results are reordered per visitor, so the row is found by its link rather than its place.
const COURSE = 'z-Xl9tGqH14'
const SEARCH = '/results?search_query=blender+guru+donut+full+course'

const seconds = (clock: string) => clock.split(':').reduce((total, part) => total * 60 + Number(part), 0)

const hoverCourse = async (page: Page) => {
  await page.goto(SEARCH)
  const card = page.locator('article.result').filter({ has: page.locator(`a.thumb[href="/watch?v=${COURSE}"]`) })
  await expect(card.locator('a.thumb img')).toBeVisible({ timeout: 120_000 })
  await card.locator('a.thumb').hover()
  await expect(card.locator('[data-painted]')).toBeVisible({ timeout: 90_000 })
  await expect(card.locator('.scrubber')).toBeVisible()
  return card
}

const countSeeks = async (page: Page, card: Locator) => {
  await card.locator('video').evaluate((video: HTMLVideoElement) => {
    const counter = window as unknown as { seeks: number }
    counter.seeks = 0
    video.addEventListener('seeking', () => {
      counter.seeks += 1
    })
  })
  return () => page.evaluate(() => (window as unknown as { seeks: number }).seeks)
}

plain('a click on the bar seeks there, and a drag scrubs storyboard frames and seeks once, on release', async ({ page }) => {
  plain.setTimeout(240_000)
  const card = await hoverCourse(page)
  const video = card.locator('video')
  const seeks = await countSeeks(page, card)
  const duration = await video.evaluate((element: HTMLVideoElement) => element.duration)
  expect(duration).toBeGreaterThan(600)
  const bar = (await card.locator('.scrubber').boundingBox())!
  const y = bar.y + bar.height - 3
  const at = (ratio: number) => bar.x + bar.width * ratio

  await page.mouse.click(at(0.3), y)
  await expect.poll(seeks).toBe(1)
  expect(Math.abs(await video.evaluate((element: HTMLVideoElement) => element.currentTime) - duration * 0.3))
    .toBeLessThan(duration * 0.01)
  expect(new URL(page.url()).pathname).toBe('/results')

  await page.mouse.move(at(0.2), y)
  await page.mouse.down()
  const frame = card.locator('.scrub-frame')
  const shown: string[] = []
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(at(0.2 + step * 0.0625), y)
    await page.waitForTimeout(150)
    shown.push(await frame.evaluateAll((elements: HTMLElement[]) =>
      elements.map(element => element.style.backgroundImage + element.style.backgroundPosition).join()))
  }
  expect(await seeks(), 'the video seeked while the button was still down').toBe(1)
  expect(new Set(shown).size, 'the scrub frame did not follow the pointer').toBeGreaterThan(1)
  const root = (await card.locator('[data-painted]').boundingBox())!
  const cover = (await frame.boundingBox())!
  expect(cover.width).toBeGreaterThanOrEqual(root.width - 2)
  expect(cover.height).toBeGreaterThanOrEqual(root.height - 2)
  expect(Math.abs(seconds(await card.locator('.scrub-time').innerText()) - duration * 0.7)).toBeLessThan(duration * 0.01)
  const mute = card.getByRole('button', { name: /mute preview/i, includeHidden: true })
  await expect(mute).toHaveCount(0)

  await page.mouse.up()
  await expect.poll(seeks).toBeGreaterThanOrEqual(2)
  expect(await seeks()).toBe(2)
  const landed = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
  expect(Math.abs(landed - duration * 0.7)).toBeLessThan(duration * 0.01)
  await expect(frame).toHaveCount(0)
  await expect(mute).toHaveCount(1)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 30_000 })
    .toBeGreaterThan(landed + 1)
  expect(new URL(page.url()).pathname).toBe('/results')
})

plain('a playing preview counts down the time left, mutes on request and stops when the pointer leaves', async ({ page }) => {
  plain.setTimeout(240_000)
  const card = await hoverCourse(page)
  const video = card.locator('video')
  const left = card.locator('[data-painted] .time')
  await expect(left).toHaveText(/^\d+(:\d{2}){1,2}$/)
  const first = seconds(await left.innerText())
  const [current, duration] = await video.evaluate((element: HTMLVideoElement) => [element.currentTime, element.duration])
  expect(Math.abs(first - (duration - current))).toBeLessThanOrEqual(2)
  await expect.poll(async () => seconds(await left.innerText()), { timeout: 15_000 }).toBeLessThan(first)

  const bar = (await card.locator('.scrubber').boundingBox())!
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height - 3)
  await expect(left).toHaveCount(0)
  await page.mouse.move(bar.x + bar.width / 2, bar.y - 40)
  await expect(left).toHaveCount(1)

  await card.getByRole('button', { name: 'Unmute preview', includeHidden: true }).click()
  expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(false)
  await card.getByRole('button', { name: 'Mute preview', includeHidden: true }).click()
  expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true)
  expect(new URL(page.url()).pathname).toBe('/results')

  const row = (await card.boundingBox())!
  await page.mouse.move(row.x - 40, row.y + row.height / 2, { steps: 4 })
  await expect(card.locator('video')).toHaveCount(0)
})

plain('a preview shows captions by default, and its CC button turns them off', async ({ page }) => {
  plain.setTimeout(240_000)
  const card = await hoverCourse(page)
  const video = card.locator('video')
  const cc = card.getByRole('button', { name: 'Subtitles/CC', includeHidden: true })
  await expect(cc).toHaveAttribute('aria-pressed', 'true')
  const showing = () => video.evaluate((element: HTMLVideoElement) =>
    [...element.textTracks].filter(track => track.mode === 'showing').map(track => track.activeCues?.length ?? 0))
  await expect.poll(async () => (await showing()).some(cues => cues > 0), { timeout: 20_000 }).toBe(true)

  await cc.click()
  await expect(cc).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(showing).toEqual([])
  expect(new URL(page.url()).pathname).toBe('/results')
})

plain('a click on a preview moved past its start opens the video where the preview is', async ({ page }) => {
  plain.setTimeout(240_000)
  const card = await hoverCourse(page)
  const preview = card.locator('[data-painted]')
  const bar = (await card.locator('.scrubber').boundingBox())!
  await page.mouse.click(bar.x + bar.width / 2, bar.y + bar.height - 3)
  const duration = await card.locator('video').evaluate((element: HTMLVideoElement) => element.duration)
  await expect.poll(() => card.locator('video').evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(duration * 0.45)
  const at = await card.locator('video').evaluate((element: HTMLVideoElement) => element.currentTime)

  await preview.click({ position: { x: 40, y: 40 } })
  await expect(page).toHaveURL(new RegExp(`/watch\\?v=${COURSE}&t=\\d+s$`))
  const asked = Number(/[?&]t=(\d+)s/.exec(page.url())![1])
  expect(Math.abs(asked - at)).toBeLessThanOrEqual(5)
  const watch = page.locator('[data-player-root] video')
  await expect.poll(() => watch.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 120_000 })
    .toBeGreaterThan(asked - 1)
  expect(await watch.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeLessThan(asked + 60)
})

import type { Locator, Page } from '@playwright/test'

import { answerLookups, dismissFknNotice, expect, hideFknNotice, plainTest, test } from './test'

// Blender Guru's 4 h donut course, with English captions: long enough that every 5% of the bar is minutes. Signed-out
// results are reordered per visitor, so the row is found by its link rather than its place.
const COURSE = 'z-Xl9tGqH14'
const SEARCH = '/results?search_query=blender+guru+donut+full+course'

const courseRow = (page: Page) =>
  page.locator('article.result').filter({ has: page.locator(`a.thumb[href="/watch?v=${COURSE}"]`) })

/* The inline preview must never paint over a thumbnail it cannot yet replace: its root is an opaque black box mounted the moment the pointer lands.
   Sampled continuously because the defect is a flash, which a before-and-after assertion passes straight through. */

test('keeps the thumbnail until the preview has a frame, then fades it in', async ({ page }) => {
  test.setTimeout(240_000)

  await page.goto(SEARCH)
  const card = courseRow(page)
  await expect(card.locator('a.thumb img')).toBeVisible({ timeout: 120_000 })
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

  await card.locator('a.thumb').hover()
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

const plain = plainTest.extend({
  page: async ({ page }, use) => {
    await hideFknNotice(page)
    await use(page)
  },
})

const seconds = (clock: string) => clock.split(':').reduce((total, part) => total * 60 + Number(part), 0)

const hoverCourse = async (page: Page) => {
  await page.goto(SEARCH)
  const card = courseRow(page)
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

plain('a playing preview counts down the time left, shows its knob only over the bar, mutes on request and stops when the pointer leaves', async ({ page }) => {
  plain.setTimeout(240_000)
  const card = await hoverCourse(page)
  const video = card.locator('video')
  const left = card.locator('[data-painted] .time')
  await expect(left).toHaveText(/^\d+(:\d{2}){1,2}$/)
  const first = seconds(await left.innerText())
  const [current, duration] = await video.evaluate((element: HTMLVideoElement) => [element.currentTime, element.duration])
  expect(Math.abs(first - (duration - current))).toBeLessThanOrEqual(2)
  await expect.poll(async () => seconds(await left.innerText()), { timeout: 15_000 }).toBeLessThan(first)

  const knob = card.locator('.knob')
  const knobOpacity = () => knob.evaluate((element: HTMLElement) => getComputedStyle(element).opacity)
  expect(await knobOpacity(), 'the knob shows at rest').toBe('0')
  const bar = (await card.locator('.scrubber').boundingBox())!
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height - 3)
  await expect(left).toHaveCount(0)
  await expect.poll(knobOpacity).toBe('1')
  await page.mouse.move(bar.x + bar.width / 2, bar.y - 40)
  await expect(left).toHaveCount(1)
  await expect.poll(knobOpacity).toBe('0')

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

plain('a click on a preview in its first 10 s opens the video from its start', async ({ page }) => {
  plain.setTimeout(240_000)
  const card = await hoverCourse(page)
  const played = await card.locator('video').evaluate((element: HTMLVideoElement) => element.currentTime)
  expect(played, 'the preview was already near 10 s, so the click proves nothing').toBeLessThan(7)
  await card.locator('[data-painted]').click({ position: { x: 40, y: 40 } })
  await expect(page).toHaveURL(new RegExp(`/watch\\?v=${COURSE}$`))
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

test('a related video plays its moving thumbnail on hover, in place of the duration', async ({ browser, baseURL }) => {
  test.setTimeout(480_000)
  /* Upstream sends these stills per visitor: on 2026-11-10 seven of nine fresh visitors got one on nearly every related
     row and two got none, the same as youtube.com itself would draw. So a fresh visitor is a fresh draw, up to three. */
  let played = false
  for (let visitor = 0; visitor < 3 && !played; visitor += 1) {
    const context = await browser.newContext({ baseURL })
    await answerLookups(context)
    const page = await context.newPage()
    await dismissFknNotice(page)
    const dislikes = page.waitForResponse(response => response.url().startsWith('https://returnyoutubedislikeapi.com/'))
    await page.goto(`/watch?v=${COURSE}`)
    expect(await (await dislikes).json(), 'the dislike lookup reached the live service').toEqual({ likes: 0, dislikes: 0 })
    const row = page.locator('aside.secondary article').nth(1)
    await expect(row.locator('a.thumb img')).toBeVisible({ timeout: 120_000 })
    await expect(row.locator('img.moving')).toHaveCount(0)
    await row.locator('a.thumb').hover()
    const moving = row.locator('img.moving')
    played = await moving.waitFor({ timeout: 3_000 }).then(() => true, () => false)
    if (played) {
      await expect(moving).toHaveAttribute('src', /^https:\/\/i\.ytimg\.com\/an_webp\//)
      await expect.poll(() => moving.evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout: 15_000 })
        .toBeGreaterThan(0)
      await expect(row.locator('.badge')).toHaveCount(0)
      const box = (await row.boundingBox())!
      await page.mouse.move(box.x - 60, box.y + box.height / 2, { steps: 4 })
      await expect(moving).toHaveCount(0)
      await expect(row.locator('.badge')).toHaveCount(1)
    }
    await context.close()
  }
  expect(played, 'no related row played a moving thumbnail for three visitors').toBe(true)
})

type Asked = { asked: { method: string, args: unknown[] }[] }

// the app asks the engine over a MessagePort, `{ id, method, args }`: a playback is answered here, so no YouTube answer is read
const answerPlaybackHere = () => {
  if (window.top !== window) return
  const state = window as unknown as Asked
  state.asked = []
  const post = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'postMessage')!.value as (this: MessagePort, message: unknown, ...rest: unknown[]) => void
  MessagePort.prototype.postMessage = function (this: MessagePort, message: unknown, ...rest: unknown[]) {
    const request = message as { id?: number, method?: string, args?: unknown[] } | null
    if (request?.method !== 'openPlayback' && request?.method !== 'prefetchPlayback') return post.call(this, message, ...rest)
    state.asked.push({ method: request.method, args: request.args ?? [] })
    const answer = request.method === 'openPlayback' ? { id: request.id, error: 'answered by the spec' } : { id: request.id, result: null }
    setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: answer })), 0)
  } as typeof MessagePort.prototype.postMessage
}

test('a row or card with inline params opens its preview with them, and one without plays its moving thumbnail', async ({ page }) => {
  test.setTimeout(240_000)
  await hideFknNotice(page)
  await page.addInitScript(answerPlaybackHere)
  await page.setViewportSize({ width: 1280, height: 1200 })
  await page.goto('/privacy?search_query=guitar+lesson')
  const known = await page.evaluate(async () => {
    const harness = '/tests/browser/fixtures/preview-harness.tsx'
    const module = await import(harness) as { mountPreviews: () => void, ROW_PARAMS: string, CARD_PARAMS: string, MOVING: string }
    module.mountPreviews()
    return { rowParams: module.ROW_PARAMS, cardParams: module.CARD_PARAMS, moving: module.MOVING }
  })
  const harness = page.locator('[data-preview-harness]')
  const cards = harness.locator('[data-previews="cards"] article')
  const [home, moving, still] = [cards.nth(0), cards.nth(1), cards.nth(2)]
  const row = harness.locator('article.result')
  const opened = () => page.evaluate(() =>
    (window as unknown as Asked).asked.filter(({ method }) => method === 'openPlayback').map(({ args }) => [args[0], args[2]]))

  await expect(row.locator('a.thumb')).toBeVisible({ timeout: 60_000 })
  await row.locator('a.thumb').hover()
  await expect(row.locator('video')).toHaveCount(1)
  await expect.poll(opened, { timeout: 120_000 }).toEqual([['search-0', known.rowParams]])
  await page.mouse.move(0, 0)
  await expect(row.locator('video')).toHaveCount(0)

  await home.locator('a.thumb').hover()
  await expect(home.locator('video')).toHaveCount(1)
  await expect.poll(opened, { timeout: 60_000 }).toEqual([['search-0', known.rowParams], ['home-0', known.cardParams]])
  await page.mouse.move(0, 0)

  await expect(moving.locator('.badge')).toHaveCount(1)
  await moving.locator('a.thumb').hover()
  await expect(moving.locator('img.moving')).toHaveAttribute('src', known.moving)
  await expect(moving.locator('.badge')).toHaveCount(0)
  // past the preview's 700 ms dwell, when a player would have been asked for
  await page.waitForTimeout(1_500)
  await expect(moving.locator('video')).toHaveCount(0)
  await page.mouse.move(0, 0)
  await expect(moving.locator('img.moving')).toHaveCount(0)
  await expect(moving.locator('.badge')).toHaveCount(1)

  await still.locator('a.thumb').hover()
  await page.waitForTimeout(1_500)
  await expect(still.locator('video')).toHaveCount(0)
  await expect(still.locator('img.moving')).toHaveCount(0)
  expect(await opened(), 'a card without params asked for a playback').toHaveLength(2)
})

for (const tab of ['HOME', 'VIDEOS'] as const) {
  test(`a channel's ${tab === 'HOME' ? 'Home row' : 'Videos tab'} plays its moving thumbnail on hover and opens no preview`, async ({ page }) => {
    test.setTimeout(240_000)
    await hideFknNotice(page)
    await page.addInitScript(answerPlaybackHere)
    await page.goto('/privacy')
    const moving = await page.evaluate(async (tab) => {
      const harness = '/tests/browser/fixtures/preview-harness.tsx'
      const module = await import(harness) as { mountChannel: (tab: 'HOME' | 'VIDEOS') => void, MOVING: string }
      module.mountChannel(tab)
      return module.MOVING
    }, tab)
    const card = page.locator('[data-preview-harness] article').filter({ has: page.locator('a.thumb[href="/watch?v=moving-0"]') })
    await expect(card.locator('a.thumb')).toBeVisible({ timeout: 60_000 })
    await card.locator('a.thumb').hover()
    await expect(card.locator('img.moving')).toHaveAttribute('src', moving)
    await page.waitForTimeout(1_500)
    await expect(card.locator('video')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as Asked).asked.filter(({ method }) => method === 'openPlayback'))).toEqual([])
  })
}

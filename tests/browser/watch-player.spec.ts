import type { Locator, Page } from '@playwright/test'

import { expect, test } from '@playwright/test'

/* The watch page's player against the live source: `dQw4w9WgXcQ` is a 213 s static video with a related list. */

const VIDEO_ID = 'dQw4w9WgXcQ'

const startPlayback = async (page: Page) => {
  const video = page.locator('video')
  await expect(video).toBeVisible({ timeout: 60_000 })
  await expect.poll(
    () => video.evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 120_000, message: 'playback did not start' },
  ).toBeGreaterThan(1)
  return video
}

const seekToEnd = (video: Locator) =>
  video.evaluate((element) => {
    const player = element as HTMLVideoElement
    player.currentTime = player.duration - 1.5
    void player.play().catch(() => {})
  })

const runToEnd = async (video: Locator) => {
  await seekToEnd(video)
  await expect.poll(
    () => video.evaluate(element => (element as HTMLVideoElement).ended),
    { timeout: 60_000, message: 'the video did not reach its end' },
  ).toBe(true)
}

const videoIdOf = (url: string) => new URL(url, 'http://localhost').searchParams.get('v')

const withAutoplay = (page: Page, autoplay: boolean) =>
  page.addInitScript((value) => {
    localStorage.setItem('yt-client:settings', JSON.stringify({ autoplay: value }))
  }, autoplay)

test('counts down at the end, then plays the first related video', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  const firstRelated = page.locator('main aside article a[href^="/watch"]').first()
  await expect(firstRelated).toBeVisible({ timeout: 60_000 })
  const expected = videoIdOf((await firstRelated.getAttribute('href'))!)

  await runToEnd(video)
  await expect(page.locator('[data-end-screen="countdown"]')).toBeVisible()
  await expect(page.getByText(/^Up next in \d$/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()

  await expect.poll(() => videoIdOf(page.url()), { timeout: 30_000 }).toBe(expected)
  await startPlayback(page)
})

test('cancelling the countdown leaves the end screen and the page', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  await runToEnd(video)

  await page.getByRole('button', { name: 'Cancel' }).click()
  const endScreen = page.locator('[data-end-screen="suggestions"]')
  await expect(endScreen).toBeVisible()
  expect(await endScreen.locator('a[href^="/watch"]').count()).toBeGreaterThan(0)
  await page.waitForTimeout(7_000)
  expect(videoIdOf(page.url())).toBe(VIDEO_ID)
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible()
})

test('with Autoplay off, shows suggestions and the player bar switch turns it back on', async ({ page }) => {
  test.setTimeout(300_000)
  await withAutoplay(page, false)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  await runToEnd(video)

  await expect(page.locator('[data-end-screen="suggestions"]')).toBeVisible()
  await expect(page.locator('[data-end-screen="countdown"]')).toHaveCount(0)
  await page.waitForTimeout(7_000)
  expect(videoIdOf(page.url())).toBe(VIDEO_ID)

  const toggle = page.getByRole('switch', { name: 'Autoplay' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yt-client:settings') ?? '{}').autoplay)).toBe(true)
})

test('a playlist moves on to its next entry', async ({ page }) => {
  test.setTimeout(300_000)
  const list = `RD${VIDEO_ID}`
  await page.goto(`/watch?v=${VIDEO_ID}&list=${list}&index=1`)
  const video = await startPlayback(page)
  const second = page.locator('section[aria-label="Playlist queue"] li').nth(1).locator('a')
  await expect(second).toBeVisible({ timeout: 60_000 })
  const expected = videoIdOf((await second.getAttribute('href'))!)

  // no wait on `ended`: the queue moves on the moment it is set, replacing the video element
  await seekToEnd(video)
  await expect.poll(() => {
    const url = new URL(page.url())
    return [url.searchParams.get('v'), url.searchParams.get('list'), url.searchParams.get('index')]
  }, { timeout: 30_000 }).toEqual([expected, list, '2'])
})

test('the player bar draws Next with its bar', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const next = page.getByRole('button', { name: 'Next' })
  await expect(next).toBeAttached({ timeout: 120_000 })
  // the bar of the skip icon is a bare line, which only a stroke draws: without one, Next reads as a second Play
  const strokes = await next.locator('svg path').evaluateAll(paths => paths.map(path => Number.parseFloat(getComputedStyle(path).strokeWidth)))
  expect(strokes.length).toBeGreaterThan(1)
  expect(Math.min(...strokes)).toBeGreaterThan(0)
})

test('the miniplayer moves on in place, without leaving the page', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)

  await page.evaluate(() => {
    history.pushState(null, '', '/settings')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 30_000 })
  const dockTitle = page.locator('.dock-title')
  await expect(dockTitle).toBeVisible()

  await runToEnd(video)
  await expect.poll(
    async () => videoIdOf((await dockTitle.getAttribute('href'))!),
    { timeout: 60_000, message: 'the miniplayer did not move on' },
  ).not.toBe(VIDEO_ID)
  expect(new URL(page.url()).pathname).toBe('/settings')
  await startPlayback(page)
})

test('the miniplayer keeps every control of its bar inside the dock', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  await startPlayback(page)
  await page.evaluate(() => {
    history.pushState(null, '', '/settings')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('.dock-title')).toBeVisible({ timeout: 30_000 })

  const player = page.locator('[data-player-root]')
  const fit = () => player.evaluate((root) => {
    const bar = root.querySelector('.bar')!
    const edge = root.getBoundingClientRect().right
    const buttons = [...bar.querySelectorAll('button')].map(button => button.getBoundingClientRect()).filter(box => box.width > 0)
    return { overflow: bar.scrollWidth - bar.clientWidth, outside: buttons.filter(box => box.right > edge + 0.5).length }
  })
  await expect.poll(async () => (await fit()).overflow, { message: 'the bar overflows the dock' }).toBeLessThanOrEqual(0)
  expect((await fit()).outside).toBe(0)
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible()
})

test('answers youtube.com keyboard shortcuts, with a bezel for each change', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  const media = () => video.evaluate((element) => {
    const player = element as HTMLVideoElement
    return { time: player.currentTime, paused: player.paused, rate: player.playbackRate, muted: player.muted, volume: player.volume, duration: player.duration }
  })
  const time = async () => (await media()).time
  await expect(page.getByRole('button', { name: 'Turn on captions' })).toBeVisible({ timeout: 60_000 })
  await page.locator('main h1').click()

  await page.keyboard.press('k')
  await expect.poll(async () => (await media()).paused).toBe(true)
  await expect(page.locator('[data-bezel="pause"]')).toBeAttached()

  // paused from here on, so every position below is exact
  const start = await time()
  await page.keyboard.press('l')
  expect(await time()).toBeCloseTo(start + 10, 1)
  await page.keyboard.press('j')
  expect(await time()).toBeCloseTo(start, 1)
  await page.keyboard.press('ArrowRight')
  expect(await time()).toBeCloseTo(start + 5, 1)
  await expect(page.locator('[data-bezel="forward"]')).toContainText('5 seconds')
  await page.keyboard.press('ArrowLeft')
  expect(await time()).toBeCloseTo(start, 1)
  await expect(page.locator('[data-bezel="back"]')).toBeAttached()

  await page.keyboard.press('.')
  const stepped = await time() - start
  expect(stepped).toBeGreaterThan(0)
  expect(stepped).toBeLessThan(0.1)
  await page.keyboard.press(',')
  expect(await time()).toBeCloseTo(start, 2)

  await page.keyboard.press('Shift+Period')
  expect((await media()).rate).toBe(1.25)
  await expect(page.locator('[data-bezel="speed"]')).toContainText('1.25x')
  await page.keyboard.press('Shift+Comma')
  expect((await media()).rate).toBe(1)

  await page.keyboard.press('ArrowDown')
  expect((await media()).volume).toBeCloseTo(0.95, 2)
  await expect(page.locator('[data-bezel="volume"]')).toContainText('95%')
  await page.keyboard.press('ArrowUp')
  expect((await media()).volume).toBeCloseTo(1, 2)
  await page.keyboard.press('m')
  expect((await media()).muted).toBe(true)
  await expect(page.locator('[data-bezel="mute"]')).toBeAttached()
  await page.keyboard.press('m')
  expect((await media()).muted).toBe(false)

  await page.keyboard.press('5')
  const { duration } = await media()
  expect(await time()).toBeCloseTo(duration / 2, 1)

  await page.keyboard.press('c')
  await expect(page.getByRole('button', { name: 'Turn off captions' })).toBeVisible()
  await page.keyboard.press('c')
  await expect(page.getByRole('button', { name: 'Turn on captions' })).toBeVisible()

  await page.keyboard.press('Shift+Slash')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Toggle miniplayer')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true)
  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false)

  await page.keyboard.press('i')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/')
  await expect(page.locator('.dock-title')).toBeVisible()
  await page.keyboard.press('i')
  await expect.poll(() => videoIdOf(page.url())).toBe(VIDEO_ID)
  await expect(page.locator('.dock-title')).toHaveCount(0)

  const firstRelated = page.locator('main aside article a[href^="/watch"]').first()
  await expect(firstRelated).toBeVisible({ timeout: 60_000 })
  const expected = videoIdOf((await firstRelated.getAttribute('href'))!)
  await page.locator('main h1').click()
  await page.keyboard.press('Shift+N')
  await expect.poll(() => videoIdOf(page.url())).toBe(expected)
})

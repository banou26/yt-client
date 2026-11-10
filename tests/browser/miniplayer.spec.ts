import type { Locator, Page } from '@playwright/test'

import { expect, test } from './test'

/* youtube.com's miniplayer, measured signed out on 2026-11-10 at 1280 x 800: a 400 x 301 box 16 px from the right and
   the bottom, the 400 x 225 video over two lines (the title, then the channel, or the playlist and the place in it), and
   over the video on hover Expand, Close, a 42 px Play or Pause and the clock. At 400 px it draws no Previous or Next,
   and Shift+P and Shift+N still move along a playlist. `dQw4w9WgXcQ` is 3:33 long, from the channel Rick Astley. */

const VIDEO_ID = 'dQw4w9WgXcQ'
// a regular playlist, whose second entry has one before it (a Mix is rebuilt on every request)
const FIXED_LIST = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'

const startPlayback = async (page: Page) => {
  const video = page.locator('video')
  await expect(video).toBeVisible({ timeout: 60_000 })
  await expect.poll(
    () => video.evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 120_000, message: 'playback did not start' },
  ).toBeGreaterThan(1)
  return video
}

const dock = (page: Page) => page.getByRole('complementary', { name: 'Miniplayer' })

const leaveForSettings = async (page: Page) => {
  await page.evaluate(() => {
    history.pushState(null, '', '/settings')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(dock(page)).toBeVisible({ timeout: 30_000 })
  // the page, not a box, holds the focus, as after a click on youtube.com's page
  await page.getByRole('heading', { name: 'Settings' }).click()
}

const box = (locator: Locator) => locator.evaluate((element) => {
  const { left, top, right, bottom, width, height } = element.getBoundingClientRect()
  return { left, top, right, bottom, width, height }
})

const opacity = (locator: Locator) => locator.evaluate(element => getComputedStyle(element).opacity)

const paused = (video: Locator) => video.evaluate(element => (element as HTMLVideoElement).paused)

const videoIdOf = (url: string) => new URL(url, 'http://localhost').searchParams.get('v')

test('draws youtube.com\'s box, title and channel, and Expand, Close, Play and the clock on hover', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  const title = page.locator('main h1')
  await expect(title).not.toBeEmpty({ timeout: 60_000 })
  const name = (await title.textContent())!.trim()
  await leaveForSettings(page)
  const mini = dock(page)

  const frame = await box(mini)
  const edge = await page.evaluate(() => ({ right: document.documentElement.clientWidth, bottom: document.documentElement.clientHeight }))
  expect(frame).toMatchObject({ width: 400, height: 301, right: edge.right - 16, bottom: edge.bottom - 16 })
  const picture = await box(video)
  expect(picture).toMatchObject({ left: frame.left, top: frame.top, width: 400, height: 225 })

  // the title on one line, cut short with an ellipsis, and the channel under it
  const heading = mini.locator('.dock-title')
  await expect(heading).toHaveText(name)
  expect(await heading.evaluate(element => ({
    height: element.getBoundingClientRect().height,
    cut: getComputedStyle(element).textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth,
  }))).toEqual({ height: 20, cut: true })
  await expect(mini.locator('.dock-byline')).toHaveText('Rick Astley')

  await page.mouse.move(picture.left + 100, picture.top + 60)
  const controls = mini.getByRole('button', { name: 'Expand' }).locator('..')
  await expect.poll(() => opacity(controls)).toBe('1')
  expect(await box(mini.getByRole('button', { name: 'Expand' }))).toMatchObject({ left: picture.left, top: picture.top, width: 40, height: 40 })
  expect(await box(mini.getByRole('button', { name: 'Close miniplayer' }))).toMatchObject({ right: picture.right, top: picture.top, width: 40, height: 40 })
  const play = await box(mini.getByRole('button', { name: 'Pause', exact: true }))
  expect(play).toMatchObject({ width: 42, height: 42 })
  expect(play.left + play.width / 2).toBeCloseTo(picture.left + picture.width / 2, 0)
  expect(play.top + play.height / 2).toBeCloseTo(picture.top + picture.height / 2, 0)
  // the player bar's own clock is still in the page, hidden with the bar
  const clock = mini.getByText(/^\d:\d\d \/ 3:33$/).filter({ visible: true })
  await expect(clock).toBeVisible()
  expect((await box(clock)).left).toBe(picture.left + 12)
  for (const control of ['Previous', 'Next', 'Settings', 'Full screen', 'Mute', 'Unmute']) {
    await expect(mini.getByRole('button', { name: control, exact: true })).toHaveCount(0)
  }

  // once the pointer leaves, only the seek bar shows, 3 px along the bottom edge of the video
  await page.mouse.move(10, 400)
  await expect.poll(() => opacity(controls)).toBe('0')
  const seek = mini.getByRole('slider', { name: 'Seek' })
  expect(await opacity(seek.locator('..'))).toBe('1')
  expect(await box(seek.locator('.rail'))).toMatchObject({ left: picture.left, bottom: picture.bottom, width: 400, height: 3 })

  await mini.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect.poll(() => paused(video)).toBe(true)
  await mini.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => paused(video)).toBe(false)
  // the clicked button keeps the focus, and the controls still go with the pointer; moving the focus by key shows them
  await page.mouse.move(10, 400)
  await expect.poll(() => opacity(controls)).toBe('0')
  await page.keyboard.press('Shift+Tab')
  await expect(mini.getByRole('button', { name: 'Close miniplayer' })).toBeFocused()
  await expect.poll(() => opacity(controls)).toBe('1')

  // Expand takes the same video element back to its watch page, still playing
  await video.evaluate((element) => {
    element.dataset.docked = 'true'
  })
  const before = await video.evaluate(element => (element as HTMLVideoElement).currentTime)
  await mini.getByRole('button', { name: 'Expand' }).click()
  await expect.poll(() => videoIdOf(page.url())).toBe(VIDEO_ID)
  await expect(dock(page)).toHaveCount(0)
  await expect(page.locator('main video[data-docked="true"]')).toBeVisible()
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(before)
})

test('f, t and a double click leave the miniplayer as it is, and Escape closes it', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  const theater = page.getByRole('button', { name: 'Theater mode' })
  await expect(theater).toHaveAttribute('aria-pressed', 'false')
  await leaveForSettings(page)

  const fullscreen = () => page.evaluate(() => document.fullscreenElement !== null)
  await page.keyboard.press('f')
  await page.keyboard.press('t')
  await page.waitForTimeout(1_000)
  expect(await fullscreen()).toBe(false)
  // away from the buttons, where the click reaches the video
  await video.dblclick({ position: { x: 100, y: 60 } })
  await page.waitForTimeout(1_000)
  expect(await fullscreen()).toBe(false)
  await expect(dock(page)).toBeVisible()

  await page.keyboard.press('i')
  await expect(dock(page)).toHaveCount(0)
  await expect(theater).toHaveAttribute('aria-pressed', 'false')
  await page.locator('main h1').click()
  await page.keyboard.press('i')
  await expect(dock(page)).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dock(page)).toHaveCount(0)
  await expect(page.locator('video')).toHaveCount(0)
  expect(new URL(page.url()).pathname).toBe('/settings')
})

// youtube.com closes Settings, or the panel open in it, as the player docks (measured signed out on 2026-11-10)
test('i with Settings or one of its panels open docks the player with the menu closed, and one Escape closes it', async ({ page }) => {
  test.setTimeout(300_000)
  for (const panel of [undefined, 'Playback speed']) {
    await page.goto(`/watch?v=${VIDEO_ID}`)
    await startPlayback(page)
    await page.locator('[data-player-root]').hover()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('menu', { name: 'Player settings' })
    await expect(settings).toBeVisible()
    if (panel) {
      await settings.getByRole('menuitem', { name: new RegExp(`^${panel}`) }).click()
      await expect(page.getByRole('menu', { name: panel })).toBeVisible()
    }

    await page.keyboard.press('i')
    await expect(dock(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dock(page)).toHaveCount(0)
    await expect(page.locator('video')).toHaveCount(0)
  }
})

test('in a playlist it names the playlist and the place in it, Shift+P plays the entry before, and Close stops it', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/playlist?list=${FIXED_LIST}`)
  const entries = page.locator(`main a[href*="list=${FIXED_LIST}"][href*="index="]`)
  await expect(entries.nth(1)).toBeAttached({ timeout: 120_000 })
  const hrefs = await entries.evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href)))
    .then(urls => urls.map(url => ({ v: url.searchParams.get('v'), index: url.searchParams.get('index') })))
  const first = hrefs.find(entry => entry.index === '1')!
  const second = hrefs.find(entry => entry.index === '2')!
  await page.goto(`/watch?v=${second.v}&list=${FIXED_LIST}&index=2`)
  const queue = page.locator('section[aria-label="Playlist queue"]')
  await expect(queue.locator('li[data-current="true"] a')).toHaveAttribute('href', new RegExp(`v=${second.v}&`), { timeout: 120_000 })
  const playlist = (await queue.locator('.playlist-title').textContent())!
  const total = (await queue.locator('.count').textContent())!.split(' / ')[1]
  await startPlayback(page)
  await leaveForSettings(page)

  const mini = dock(page)
  const place = mini.locator('.dock-byline')
  await expect(place.locator('.dock-name')).toHaveText(playlist)
  await expect(place.locator('.dock-index')).toHaveText(`2 / ${total}`)
  expect(await place.locator('.dock-index').evaluate(element => getComputedStyle(element, '::before').content)).toBe('"•"')

  await page.keyboard.press('Shift+P')
  await expect(place.locator('.dock-index')).toHaveText(`1 / ${total}`, { timeout: 60_000 })
  expect(videoIdOf((await mini.locator('.dock-title').getAttribute('href'))!)).toBe(first.v)
  expect(new URL(page.url()).pathname).toBe('/settings')
  await startPlayback(page)

  await mini.getByRole('button', { name: 'Close miniplayer' }).click()
  await expect(dock(page)).toHaveCount(0)
  await expect(page.locator('video')).toHaveCount(0)
})

type EngineFailure = { armed: boolean, port?: MessagePort }

declare global {
  interface Window { engineFailure?: EngineFailure, sameDocument?: true }
}

// the app asks the engine over a MessagePort, `{ id, method, args }`: once armed, every segment the running engine is
// asked for is answered with the error of a failed playback request, which makes the player replace the engine, and the
// next engine's port is let through
const failRunningEngine = () => {
  if (window.top !== window) return
  const failure: EngineFailure = { armed: false }
  window.engineFailure = failure
  const post = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'postMessage')!.value as (this: MessagePort, message: unknown, ...rest: unknown[]) => void
  MessagePort.prototype.postMessage = function (this: MessagePort, message: unknown, ...rest: unknown[]) {
    const call = message as { id?: number, method?: string } | null
    if (failure.armed && call?.method === 'requestSegment') {
      failure.port ??= this
      if (failure.port === this) {
        setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { id: call.id, error: 'youtube: segment returned 503' } })), 0)
        return
      }
      failure.armed = false
    }
    return post.call(this, message, ...rest)
  } as typeof MessagePort.prototype.postMessage
}

test('plays on after its engine is replaced, with a new release deployed since the page opened', async ({ page }) => {
  test.setTimeout(300_000)
  await page.addInitScript(failRunningEngine)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  await leaveForSettings(page)
  await page.evaluate(() => { window.sameDocument = true })
  // the deploy: the engine host's fixed address now serves the page of another build
  let hostLoads = 0
  await page.route('**/__yt_scramjet__/host.html', async (route) => {
    hostLoads += 1
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace(/(name="yt-build" content=")[^"]*/, '$1a-later-build') })
  })
  const before = await video.evaluate(element => (element as HTMLVideoElement).currentTime)
  await page.evaluate(() => { window.engineFailure!.armed = true })
  await expect.poll(() => page.evaluate(() => window.engineFailure?.armed), { timeout: 60_000, message: 'the engine was not replaced' }).toBe(false)
  expect(await page.evaluate(() => window.sameDocument), 'the page reloaded').toBe(true)
  await expect.poll(
    () => video.evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 60_000, message: 'the docked video did not play on' },
  ).toBeGreaterThan(before + 3)
  expect(await paused(video)).toBe(false)
  await expect(dock(page)).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/settings')
  expect(hostLoads, 'the engine host was loaded again').toBe(0)
})

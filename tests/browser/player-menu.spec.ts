import type { Locator, Page } from '@playwright/test'

import { expect, test } from './test'

/* The player's right-click menu against the live source: `jNQXAC9IVRw` is "Me at the zoo", and `dQw4w9WgXcQ` has a
   mix, `RDdQw4w9WgXcQ`, whose queue moves on at the end of the video. */

const VIDEO_ID = 'jNQXAC9IVRw'
const QUEUED_ID = 'dQw4w9WgXcQ'
const ROWS = ['Loop', 'Miniplayer', 'Copy video URL', 'Copy video URL at current time', 'Copy embed code']

const startPlayback = async (page: Page) => {
  const video = page.locator('video')
  await expect(video).toBeVisible({ timeout: 60_000 })
  await expect.poll(
    () => video.evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 120_000, message: 'playback did not start' },
  ).toBeGreaterThan(1)
  return video
}

const player = (page: Page) => page.locator('[data-player-root]')
const menu = (page: Page) => page.getByRole('menu', { name: 'Player menu' })
const rows = (page: Page) => menu(page).locator('[role^="menuitem"]').allTextContents()
const loopRow = (page: Page) => menu(page).getByRole('menuitemcheckbox', { name: 'Loop' })
const paused = (video: Locator) => video.evaluate(element => (element as HTMLVideoElement).paused)

const rightClick = async (page: Page, x: number, y: number) => {
  const box = (await player(page).boundingBox())!
  // whole pixels: a mouse event carries whole ones, so a fractional point would put the menu a fraction short of + 1
  const point = { x: Math.round(box.x + box.width * x), y: Math.round(box.y + box.height * y) }
  await page.mouse.click(point.x, point.y, { button: 'right' })
  return point
}

// what is drawn at the menu's middle, which only the menu answers when nothing covers it, fullscreen included
const onTop = (page: Page) => menu(page).evaluate((panel) => {
  const box = panel.getBoundingClientRect()
  return panel.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
})

const select = async (page: Page, name: string) => {
  await rightClick(page, 0.3, 0.3)
  await expect(menu(page)).toBeVisible()
  await menu(page).getByRole(name === 'Loop' ? 'menuitemcheckbox' : 'menuitem', { name, exact: true }).click()
  await expect(menu(page)).toHaveCount(0)
}

// marks the video once its clock runs back from its last 2 s to its first 2 s
const watchLoop = (video: Locator) => video.evaluate((element) => {
  const media = element as HTMLVideoElement
  let last = 0
  media.addEventListener('timeupdate', () => {
    if (last > media.duration - 2 && media.currentTime < 2) media.dataset.looped = 'true'
    last = media.currentTime
  })
  media.currentTime = media.duration - 1.5
  void media.play().catch(() => {})
})

test("right-clicking the player opens youtube.com's menu at the pointer, and Escape closes it", async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(() => {
    addEventListener('contextmenu', event => document.documentElement.setAttribute('data-browser-menu', String(!event.defaultPrevented)))
  })
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  // paused, so the bar stays up and the clock holds still
  await video.evaluate(element => (element as HTMLVideoElement).pause())

  const pointer = await rightClick(page, 0.25, 0.25)
  await expect(menu(page)).toBeVisible()
  expect(await rows(page)).toEqual(ROWS)
  await expect(loopRow(page)).toHaveAttribute('aria-checked', 'false')
  // the row's icon and no check mark
  await expect(loopRow(page).locator('svg')).toHaveCount(1)
  await expect(page.locator('html')).toHaveAttribute('data-browser-menu', 'false')
  const box = (await menu(page).boundingBox())!
  expect([Math.round(box.x - pointer.x), Math.round(box.y - pointer.y)]).toEqual([1, 1])
  await expect(loopRow(page)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu(page).getByRole('menuitem', { name: 'Miniplayer' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)

  // an Escape that comes as the menu is drawn, before the next paint, closes it too
  const drawn = await page.evaluate(async () => {
    const box = document.querySelector('[data-player-root]')!.getBoundingClientRect()
    document.querySelector('[data-player-root] video')!.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: box.left + 50,
      clientY: box.top + 50,
    }))
    await Promise.resolve()
    const shown = document.querySelector('[role="menu"][aria-label="Player menu"]') !== null
    ;(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    return shown
  })
  expect(drawn).toBe(true)
  await expect(menu(page)).toHaveCount(0)

  // on the seek rail too, without seeking
  const time = () => video.evaluate(element => (element as HTMLVideoElement).currentTime)
  const before = await time()
  const rail = (await player(page).locator('.rail').boundingBox())!
  await page.mouse.click(rail.x + rail.width * 0.9, rail.y + rail.height / 2, { button: 'right' })
  await expect(menu(page)).toBeVisible()
  expect(await time()).toBeCloseTo(before, 1)
  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)

  // short of room it slides back inside the viewport, as youtube.com's does, rather than flipping above the pointer
  await page.setViewportSize({ width: 1280, height: 600 })
  await rightClick(page, 0.5, 0.8)
  const low = (await menu(page).boundingBox())!
  expect(Math.round(low.y + low.height)).toBe(600)

  // a second right-click gets the browser's own menu
  await rightClick(page, 0.5, 0.5)
  await expect(menu(page)).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-browser-menu', 'true')
})

test('Loop repeats the video rather than moving its queue on, and the queue moves on again without it', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${QUEUED_ID}&list=RD${QUEUED_ID}&index=1`)
  const video = await startPlayback(page)
  await expect(page.locator('section[aria-label="Playlist queue"] li').nth(1)).toBeVisible({ timeout: 60_000 })

  await select(page, 'Loop')
  await rightClick(page, 0.3, 0.3)
  await expect(loopRow(page)).toHaveAttribute('aria-checked', 'true')
  // the check mark after the row's icon, as youtube.com draws it
  await expect(loopRow(page).locator('svg')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)

  await watchLoop(video)
  await expect(video).toHaveAttribute('data-looped', 'true', { timeout: 60_000 })
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime), { message: 'the video did not play on from its start' })
    .toBeGreaterThan(2)
  expect(new URL(page.url()).searchParams.get('v')).toBe(QUEUED_ID)

  await select(page, 'Loop')
  await video.evaluate((element) => {
    const media = element as HTMLVideoElement
    media.currentTime = media.duration - 1.5
    void media.play().catch(() => {})
  })
  await expect.poll(() => new URL(page.url()).searchParams.get('v'), { timeout: 30_000 }).not.toBe(QUEUED_ID)
})

test("the copy rows write this app's link, the link at the current second and youtube.com's embed code", async ({ page, context, baseURL }) => {
  test.setTimeout(240_000)
  const origin = new URL(baseURL!).origin
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  await expect(page.getByRole('heading', { name: 'Me at the zoo', level: 1 })).toBeVisible({ timeout: 60_000 })
  await video.evaluate((element) => {
    const media = element as HTMLVideoElement
    media.pause()
    media.currentTime = 7.6
  })
  await expect.poll(() => video.evaluate(element => !(element as HTMLVideoElement).seeking)).toBe(true)
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText())

  await select(page, 'Copy video URL')
  await expect.poll(clipboard).toBe(`${origin}/watch?v=${VIDEO_ID}`)
  await expect(page.locator('[data-bezel="link"]')).toBeAttached()

  await select(page, 'Copy video URL at current time')
  await expect.poll(clipboard).toBe(`${origin}/watch?v=${VIDEO_ID}&t=7`)

  await select(page, 'Copy embed code')
  const { width, height } = (await player(page).boundingBox())!
  await expect.poll(clipboard).toBe(
    `<iframe width="${Math.round(width)}" height="${Math.round(height)}" src="https://www.youtube.com/embed/${VIDEO_ID}" title="Me at the zoo"`
    + ' frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"'
    + ' referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>',
  )
  await expect(page.locator('[data-bezel="code"]')).toBeAttached()
})

test('the menu opens over the player in fullscreen and in the miniplayer, without the Miniplayer row there', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)

  // marked by the event, which reaches the player's own listener first: fullscreenElement changes a frame before it, and a
  // menu opened in that frame is closed by the player's listener
  await page.evaluate(() => document.addEventListener('fullscreenchange', () => {
    document.documentElement.dataset.fullscreen = document.fullscreenElement?.hasAttribute('data-player-root') ? 'player' : 'none'
  }))
  await video.dblclick()
  await expect(page.locator('html')).toHaveAttribute('data-fullscreen', 'player')
  await rightClick(page, 0.5, 0.5)
  await expect(menu(page)).toBeVisible()
  expect(await onTop(page)).toBe(true)
  expect(await rows(page)).toEqual(ROWS.filter(row => row !== 'Miniplayer'))
  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)
  await page.evaluate(() => document.exitFullscreen())
  await expect(page.locator('html')).toHaveAttribute('data-fullscreen', 'none')

  await select(page, 'Miniplayer')
  await expect(page.locator('.dock-title')).toBeVisible({ timeout: 30_000 })
  expect(new URL(page.url()).pathname).toBe('/')
  await rightClick(page, 0.5, 0.5)
  await expect(menu(page)).toBeVisible()
  expect(await onTop(page)).toBe(true)
  expect(await rows(page)).toEqual(ROWS.filter(row => row !== 'Miniplayer'))
})

test('a click on the video closes the menu without pausing, and the player keys work while it is open', async ({ page }) => {
  test.setTimeout(240_000)
  // the 3 minute one, which cannot end and pause itself before the checks
  await page.goto(`/watch?v=${QUEUED_ID}`)
  const video = await startPlayback(page)

  // as on youtube.com, k pauses and plays with the menu left open
  await rightClick(page, 0.3, 0.3)
  await expect(menu(page)).toBeVisible()
  await page.keyboard.press('k')
  await expect.poll(() => paused(video)).toBe(true)
  await page.keyboard.press('k')
  await expect.poll(() => paused(video)).toBe(false)
  await expect(menu(page)).toBeVisible()

  const box = (await player(page).boundingBox())!
  const away = { x: box.x + box.width * 0.1, y: box.y + box.height * 0.5 }
  await page.mouse.click(away.x, away.y)
  await expect(menu(page)).toHaveCount(0)
  expect(await paused(video)).toBe(false)

  // the same click with no menu open pauses
  await page.mouse.click(away.x, away.y)
  await expect.poll(() => paused(video)).toBe(true)
})

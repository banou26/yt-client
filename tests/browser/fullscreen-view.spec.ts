import type { Locator, Page } from '@playwright/test'

import { expect, plainTest as test } from './test'

/* youtube.com's full screen view, measured signed out on 2026-11-10: the title over the top, like, comments, share and
   save above the controls, and a grid of the first 12 related videos that the wheel, the arrow or v opens. A video
   picked in the grid plays without leaving full screen. */

const VIDEO_ID = 'dQw4w9WgXcQ'

const startPlayback = async (page: Page) => {
  const video = page.locator('[data-player-root] video')
  await expect.poll(
    () => video.evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 120_000, message: 'playback did not start' },
  ).toBeGreaterThan(1)
}

const playerIsFullscreen = (page: Page) =>
  page.evaluate(() => document.fullscreenElement?.hasAttribute('data-player-root') ?? false)

const relatedIds = async (page: Page) => {
  const ids = await page.locator('main aside article a[href^="/watch"]').evaluateAll(links =>
    links.map(link => new URL(link.getAttribute('href')!, location.href).searchParams.get('v')))
  return [...new Set(ids)].filter(id => id !== null && id !== 'dQw4w9WgXcQ')
}

// a real key press, from the page rather than from a control, since requestFullscreen needs the user's gesture
const enterFullscreen = async (page: Page) => {
  await page.locator('main h1').click()
  await page.keyboard.press('f')
  await expect.poll(() => playerIsFullscreen(page)).toBe(true)
}

// the view's controls fade with the player's after 2.5 s still, so the pointer wakes them before each press
const press = async (page: Page, control: Locator) => {
  await expect(async () => {
    await page.mouse.move(200, 300)
    await page.mouse.move(240, 320)
    await control.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

// the view hides by fading, which Playwright still counts as visible
const opacity = (locator: Locator) => locator.evaluate((element) => {
  let value = 1
  for (let node: Element | null = element; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity)
  return value
})

// the surface goes idle once the pointer has been still for 2.5 s with the video playing
const idle = (page: Page) => expect(page.locator('[data-player-surface]')).toHaveClass(/\bidle\b/, { timeout: 15_000 })

test('shows the title, opens a grid of the related videos, and plays one in full screen', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  await startPlayback(page)
  await expect(page.locator('main aside article').first()).toBeVisible({ timeout: 60_000 })
  const title = (await page.locator('main h1').textContent())!.trim()
  const related = await relatedIds(page)
  expect(related.length).toBeGreaterThan(0)

  await enterFullscreen(page)
  const player = page.locator('[data-player-root]')
  const heading = player.getByRole('heading', { name: title, exact: true })
  const share = player.getByRole('button', { name: 'Share' })
  await expect(heading).toBeVisible()
  await page.mouse.move(600, 300)
  await expect.poll(() => opacity(heading)).toBe(1)

  // the title and the actions hide with the controls, as youtube.com's do
  await idle(page)
  await expect.poll(() => opacity(heading)).toBe(0)
  expect(await opacity(share)).toBe(0)

  const grid = player.getByRole('list', { name: 'More videos' })
  await expect(grid).toHaveCount(0)
  // what @fkn/lib does while its notice or bar takes in the pointer: it scrolls the page under the player by the wheel
  await page.evaluate(() => addEventListener('wheel', (event: WheelEvent) => document.scrollingElement!.scrollBy(0, event.deltaY), { capture: true }))
  await page.mouse.move(640, 300)
  await page.mouse.wheel(0, 120)
  await expect(grid).toBeVisible()
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  // and stay hidden over the open grid, though the pointer is moving
  await page.mouse.move(600, 320)
  await expect.poll(() => opacity(heading)).toBe(0)
  expect(await opacity(share)).toBe(0)
  const shown = await grid.getByRole('link').evaluateAll(links =>
    links.map(link => new URL(link.getAttribute('href')!, location.href).searchParams.get('v')))
  expect(shown).toEqual(related.slice(0, 12))

  // closed by its arrow and by a wheel back up, and opened again by the arrow in the controls and by v
  await player.getByRole('button', { name: 'Hide videos' }).click()
  await expect(grid).toHaveCount(0)
  await press(page, player.getByRole('button', { name: 'More videos' }))
  await expect(grid).toBeVisible()
  await page.mouse.wheel(0, -120)
  await expect(grid).toHaveCount(0)
  await page.keyboard.press('v')
  await expect(grid).toBeVisible()

  const first = grid.getByRole('link').first()
  const picked = new URL((await first.getAttribute('href'))!, 'http://localhost').searchParams.get('v')!
  const pickedTitle = (await first.locator('.fs-title').textContent())!.trim()
  await first.click()
  await expect(grid).toHaveCount(0)
  await expect(player.getByRole('heading', { name: pickedTitle, exact: true })).toBeVisible()
  await expect.poll(
    () => player.locator('video').evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 120_000, message: 'the picked video did not play' },
  ).toBeGreaterThan(1)
  expect(await playerIsFullscreen(page)).toBe(true)

  // the page under the player follows the video once full screen ends
  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await expect.poll(() => new URL(page.url()).searchParams.get('v')).toBe(picked)
})

test('its actions open what the watch page opens, signed out', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`/watch?v=${VIDEO_ID}`)
  await startPlayback(page)
  await enterFullscreen(page)
  const player = page.locator('[data-player-root]')

  // a settings menu keeps the title up and takes the action pill's place, as youtube.com's does
  await press(page, player.getByRole('button', { name: 'Settings' }))
  const settings = player.getByRole('menu', { name: 'Player settings' })
  await expect(settings).toBeVisible()
  await expect(player.getByRole('button', { name: 'Share' })).toBeHidden()
  await idle(page)
  expect(await opacity(player.locator('.fs-heading'))).toBe(1)
  // a wheel over it is the menu's, not the grid's
  await settings.hover()
  await page.mouse.wheel(0, 300)
  await expect(settings).toBeVisible()
  await page.waitForTimeout(1_000)
  await expect(player.getByRole('list', { name: 'More videos' })).toHaveCount(0)
  await press(page, player.getByRole('button', { name: 'Settings' }))
  await expect(settings).toHaveCount(0)

  await press(page, player.getByRole('button', { name: 'Share' }))
  const share = player.getByRole('dialog', { name: 'Share' })
  await expect(share).toBeVisible()
  await expect(share.getByRole('textbox', { name: 'Share link' })).toHaveValue(new RegExp(`/watch\\?v=${VIDEO_ID}$`))
  // its toast shows in full screen too, whether the clipboard took the link or not
  await share.getByRole('button', { name: 'Copy' }).click()
  await expect(player.getByRole('status')).toHaveText(/copied|copy/)
  await share.getByRole('button', { name: 'Close' }).click()
  await expect(share).toHaveCount(0)

  // comments open beside the video, which narrows to make room
  await press(page, player.getByRole('button', { name: 'Comments' }))
  const comments = player.getByRole('complementary', { name: 'Comments' })
  await expect(comments).toBeVisible()
  const room = () => player.evaluate(root => root.getBoundingClientRect().width - root.querySelector('video')!.getBoundingClientRect().width)
  const panel = (await comments.boundingBox())!
  expect(await room()).toBeGreaterThanOrEqual(panel.width)
  await expect(comments.getByRole('heading', { name: /Comments/ })).toBeVisible()
  await comments.getByRole('button', { name: 'Close comments' }).click()
  await expect(comments).toHaveCount(0)
  await expect.poll(room).toBe(0)

  // like opens the sign-in window, as the watch page's does: a signed-out read says INDIFFERENT, as a signed-in one does
  const opened = page.context().waitForEvent('page', { timeout: 30_000 })
  await press(page, player.getByRole('button', { name: 'Like', exact: true }))
  const popup = await opened
  await expect(popup).toHaveURL(/\/__yt_scramjet__\/signin(?:\.html)?$/)
  await popup.close()
})

test('the chapters and the comments take turns in one slot beside the video', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  // six chapters, as the chapters spec reads them
  await page.goto('/watch?v=g6Die8gVFn0')
  await startPlayback(page)
  await enterFullscreen(page)
  const player = page.locator('[data-player-root]')
  const chapters = player.locator('section[aria-label="Chapters"]')
  const comments = player.getByRole('complementary', { name: 'Comments' })
  const videoWidth = async () => (await player.locator('video').boundingBox())!.width
  // youtube.com's chapter title takes at most a quarter of the player's width
  const titleRoom = () => player.locator('.chapter').evaluate(element => getComputedStyle(element).maxWidth)

  // youtube.com's one 320 px slot, 16 px in from the edges, with the video narrowed beside it (measured 2026-11-10)
  const slot = { x: 944, y: 16, width: 320, height: 768 }
  expect(await titleRoom()).toBe('320px')
  await press(page, player.locator('.chapter'))
  await expect(chapters).toBeVisible()
  expect(await chapters.boundingBox()).toEqual(slot)
  expect(await videoWidth()).toBe(928)

  await press(page, player.getByRole('button', { name: 'Comments' }))
  await expect(comments).toBeVisible()
  await expect(chapters).toHaveCount(0)
  expect(await comments.boundingBox()).toEqual(slot)
  expect(await videoWidth()).toBe(928)
  expect(await titleRoom()).toBe('232px')
  // the grid's arrow stays, in the middle of the narrowed video, where youtube.com's is
  const more = player.getByRole('button', { name: 'More videos' })
  await expect(more).toBeVisible()
  expect(await more.boundingBox()).toEqual({ x: 444, y: 752, width: 40, height: 40 })
  // and the chapter title, which takes more room here than on youtube.com, gives way 8 px short of it
  const title = (await player.locator('.chapter').boundingBox())!
  expect(title.x + title.width).toBeLessThanOrEqual(436)

  await press(page, player.locator('.chapter'))
  await expect(chapters).toBeVisible()
  await expect(comments).toHaveCount(0)
  expect(await videoWidth()).toBe(928)

  // and the comments it replaced do not come back when it closes
  await chapters.getByRole('button', { name: 'Close' }).click()
  await expect(chapters).toHaveCount(0)
  await expect(comments).toHaveCount(0)
  expect(await videoWidth()).toBe(1280)
})

test('the transcript takes the same slot, and the comments replace it', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  // six chapters and a transcript, so the chapter title's list carries a chip for each
  await page.goto('/watch?v=g6Die8gVFn0')
  await startPlayback(page)
  await enterFullscreen(page)
  const player = page.locator('[data-player-root]')
  const transcript = player.locator('section[aria-label="Transcript"]')
  const comments = player.getByRole('complementary', { name: 'Comments' })
  const slot = { x: 944, y: 16, width: 320, height: 768 }

  await press(page, player.locator('.chapter'))
  await player.locator('section[aria-label="Chapters"]').getByRole('tab', { name: 'Transcript' }).click()
  await expect(transcript).toBeVisible()
  await expect(transcript.getByRole('heading', { name: 'In this video' })).toBeVisible()
  expect(await transcript.boundingBox()).toEqual(slot)

  await press(page, player.getByRole('button', { name: 'Comments' }))
  await expect(comments).toBeVisible()
  await expect(transcript).toHaveCount(0)
  expect(await comments.boundingBox()).toEqual(slot)
  expect((await player.locator('video').boundingBox())!.width).toBe(928)
})

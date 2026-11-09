import type { Page } from '@playwright/test'

import { expect, plainTest, test } from './test'

/* Chapters against the live source. g6Die8gVFn0 (12:59) has six chapters, as youtube.com showed them on 2026-11-10;
   they are auto-generated, so YouTube could redraw them one day. Specs that seek far run in plainTest, which upstream
   lets past its preview limit. */

const VIDEO = '/watch?v=g6Die8gVFn0'
const CHAPTERS = [
  { title: 'Hardware and performance', time: '0:00', start: 0 },
  { title: 'Pricing and restrictions', time: '2:41', start: 161.094 },
  { title: 'The 60Hz display debate', time: '5:47', start: 347.18 },
  { title: 'Water resistance and audio', time: '7:38', start: 458.858 },
  { title: 'Usage and impressions', time: '9:38', start: 578.544 },
  { title: 'Accessories and conclusion', time: '11:40', start: 700.466 },
]

const player = (page: Page) => page.locator('[data-player-root]')
const video = (page: Page) => player(page).locator('video')
const currentTime = (page: Page) => video(page).evaluate(element => (element as HTMLVideoElement).currentTime)

const openPaused = async (page: Page, at: number) => {
  await page.goto(VIDEO)
  await expect.poll(() => currentTime(page).catch(() => 0), { timeout: 120_000, message: 'playback did not start' }).toBeGreaterThan(1)
  await expect(player(page).locator('.rail .part')).toHaveCount(CHAPTERS.length, { timeout: 60_000 })
  await video(page).evaluate((element, to) => {
    const media = element as HTMLVideoElement
    media.pause()
    media.currentTime = to
  }, at)
  await expect.poll(() => currentTime(page)).toBeCloseTo(at, 0)
}

// the pointer over the player wakes its controls
const wake = async (page: Page) => {
  const box = (await player(page).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3)
}

const parts = (page: Page) => player(page).locator('.rail .part').evaluateAll(elements => elements.map((element) => {
  const box = element.getBoundingClientRect()
  return { left: box.left, right: box.right, top: box.top, height: box.height, width: box.width }
}))

plainTest('draws a part of the seek bar per chapter, 4 px apart, and names the chapter under the pointer', async ({ page }) => {
  plainTest.setTimeout(300_000)
  await openPaused(page, 400)
  const duration = await video(page).evaluate(element => (element as HTMLVideoElement).duration)
  const drawn = await parts(page)
  const room = drawn.reduce((total, part) => total + part.width, 0)
  for (const [index, part] of drawn.entries()) {
    const end = CHAPTERS[index + 1]?.start ?? duration
    expect(part.width / room, `chapter ${index + 1} takes its share of the bar`).toBeCloseTo((end - CHAPTERS[index]!.start) / duration, 2)
    if (index > 0) expect(part.left - drawn[index - 1]!.right, `the gap before chapter ${index + 1}`).toBeCloseTo(4, 0)
  }

  // 6:31, in the third chapter
  const third = drawn[2]!
  const x = third.left + third.width * ((391.5 - CHAPTERS[2]!.start) / (CHAPTERS[3]!.start - CHAPTERS[2]!.start))
  await page.mouse.move(x, third.top + third.height / 2)
  await expect(player(page).locator('.preview-time')).toHaveText(/^6:3[012]The 60Hz display debate$/)
  // the chapter under the pointer grows to 10 px, and the others to 6 px
  await expect.poll(async () => (await parts(page)).map(part => Math.round(part.height))).toEqual([6, 6, 10, 6, 6, 6])

  // youtube.com's miniplayer keeps the parts and names no chapter under its frame
  await page.evaluate(() => {
    history.pushState(null, '', '/settings')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('.dock-title')).toBeVisible({ timeout: 30_000 })
  await wake(page)
  const docked = await parts(page)
  expect(docked).toHaveLength(CHAPTERS.length)
  expect(docked[1]!.left - docked[0]!.right).toBeCloseTo(4, 0)
  await page.mouse.move(docked[2]!.left + docked[2]!.width / 2, docked[2]!.top + docked[2]!.height / 2)
  await expect(player(page).locator('.preview-time')).toHaveText(/^\d+:\d\d$/, { useInnerText: true })
  await expect(player(page).locator('.preview-chapter')).toBeHidden()
})

plainTest('opens the chapter list from the chapter title, on the chapter playing, and a row seeks to its chapter', async ({ page }) => {
  plainTest.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await openPaused(page, 400)
  await wake(page)
  const title = player(page).locator('.chapter')
  await expect(title).toHaveText(CHAPTERS[2]!.title)
  await title.click()

  const panel = page.locator('main aside section[aria-label="Chapters"]')
  await expect(panel).toBeVisible()
  const rows = panel.locator('.chapter-row')
  await expect(rows).toHaveCount(CHAPTERS.length)
  await expect(rows.nth(0)).toHaveText(`${CHAPTERS[0]!.title}${CHAPTERS[0]!.time}`)
  await expect(panel.locator('[aria-current="true"]')).toHaveText(`${CHAPTERS[2]!.title}${CHAPTERS[2]!.time}`)

  await rows.nth(3).click()
  await expect.poll(() => currentTime(page)).toBeGreaterThanOrEqual(CHAPTERS[3]!.start - 0.1)
  expect(await currentTime(page)).toBeLessThan(CHAPTERS[3]!.start + 5)
  await expect(panel.locator('[aria-current="true"]')).toHaveText(`${CHAPTERS[3]!.title}${CHAPTERS[3]!.time}`)

  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(panel).toHaveCount(0)
})

plainTest('opens the chapter list over the right of the player in full screen', async ({ page }) => {
  plainTest.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await openPaused(page, 400)
  await wake(page)
  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute('data-player-root') ?? false)).toBe(true)
  await wake(page)
  await player(page).locator('.chapter').click()

  const panel = player(page).locator('section[aria-label="Chapters"]')
  await expect(panel).toBeVisible()
  const [box, frame] = await Promise.all([panel.boundingBox(), video(page).boundingBox()])
  // youtube.com's 320 px list, 16 px in from the top, right and bottom, with the video beside it
  expect(box).toEqual({ x: 944, y: 16, width: 320, height: 768 })
  expect(frame!.width).toBe(928)
  await panel.locator('.chapter-row').nth(4).click()
  await expect.poll(() => currentTime(page)).toBeGreaterThanOrEqual(CHAPTERS[4]!.start - 0.1)
  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(true)
})

plainTest('Ctrl+Right and Ctrl+Left seek to the next and the previous chapter, as the shortcuts list says', async ({ page }) => {
  plainTest.setTimeout(300_000)
  await openPaused(page, 400)
  await page.keyboard.press('Control+ArrowRight')
  await expect.poll(() => currentTime(page)).toBeCloseTo(CHAPTERS[3]!.start, 1)
  await page.keyboard.press('Control+ArrowRight')
  await expect.poll(() => currentTime(page)).toBeCloseTo(CHAPTERS[4]!.start, 1)
  // to the start of the chapter before, never back to the start of the one playing
  await page.keyboard.press('Control+ArrowLeft')
  await expect.poll(() => currentTime(page)).toBeCloseTo(CHAPTERS[3]!.start, 1)
  await page.keyboard.press('Control+ArrowLeft')
  await expect.poll(() => currentTime(page)).toBeCloseTo(CHAPTERS[2]!.start, 1)

  await page.keyboard.press('Shift+?')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toContainText('Seek to previous chapterCtrl+←')
  await expect(dialog).toContainText('Seek to next chapterCtrl+→')
})

plainTest('lists the chapters in the expanded description, where a card seeks and View all opens the list', async ({ page }) => {
  plainTest.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(VIDEO)
  await expect.poll(() => currentTime(page).catch(() => 0), { timeout: 120_000, message: 'playback did not start' }).toBeGreaterThan(0.5)
  const box = page.locator('main div:has(> .snippet)')
  // on the counts, clear of the links further down
  await box.click({ position: { x: 20, y: 10 } })
  const section = box.locator('section[aria-label="Chapters"]')
  await expect(section.getByRole('heading', { name: 'Chapters' })).toBeVisible()
  const cards = section.locator('.card')
  await expect(cards).toHaveCount(CHAPTERS.length)
  for (const [index, chapter] of CHAPTERS.entries()) await expect(cards.nth(index)).toHaveText(`${chapter.time}${chapter.title}`)
  await expect(section.locator('[aria-current="true"]')).toHaveText(`${CHAPTERS[0]!.time}${CHAPTERS[0]!.title}`)

  await cards.nth(1).click()
  await expect.poll(() => currentTime(page)).toBeGreaterThanOrEqual(CHAPTERS[1]!.start - 0.1)
  await expect(section.locator('[aria-current="true"]')).toHaveText(`${CHAPTERS[1]!.time}${CHAPTERS[1]!.title}`)
  await expect.poll(() => page.evaluate(() => scrollY), { message: 'the page goes back up to the player' }).toBe(0)

  await page.evaluate(() => document.querySelector('main section[aria-label="Chapters"]')!.scrollIntoView())
  await section.getByRole('button', { name: 'View all' }).click()
  await expect(page.locator('main aside section[aria-label="Chapters"]')).toBeVisible()
})

test('opens the chapter list under the player at 412 px, where the bar has no room for the chapter title', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 412, height: 860 })
  await page.goto(VIDEO)
  await expect(player(page).locator('.rail .part')).toHaveCount(CHAPTERS.length, { timeout: 120_000 })
  await expect(player(page).locator('.chapter')).toBeHidden()
  const box = page.locator('main div:has(> .snippet)')
  await box.click({ position: { x: 20, y: 10 } })
  await box.getByRole('button', { name: 'View all' }).click()
  const panel = page.locator('main .chapters-slot section[aria-label="Chapters"]')
  await expect(panel).toBeVisible()
  const [frame, list, title] = await Promise.all([player(page).boundingBox(), panel.boundingBox(), page.locator('main h1.title').boundingBox()])
  expect(list!.y).toBeGreaterThan(frame!.y + frame!.height)
  expect(list!.y + list!.height).toBeLessThan(title!.y)
})

test('a search row lists its chapters on one line, and opens on cards that start the video at each', async ({ page }) => {
  await page.goto('/settings')
  await page.evaluate(async () => {
    const harness = '/tests/browser/fixtures/chapters-harness.tsx'
    const { mountStrip } = await import(harness) as { mountStrip: () => void }
    mountStrip()
  })
  const strip = page.locator('[data-chapters-harness]')
  const head = strip.getByRole('button', { expanded: false })
  await expect(head).toHaveText('3 chaptersIntro | Disassembly | Cartridge Replacement')
  await head.click()
  await expect(strip.getByRole('button', { expanded: true })).toHaveText('3 auto-generated chapters in this video')
  await expect(strip.locator('a.card')).toHaveCount(3)
  expect(await strip.locator('a.card').evaluateAll(cards => cards.map(card => card.getAttribute('href')))).toEqual([
    '/watch?v=C3zuzzDLLck',
    '/watch?v=C3zuzzDLLck&t=50s',
    '/watch?v=C3zuzzDLLck&t=140s',
  ])
})

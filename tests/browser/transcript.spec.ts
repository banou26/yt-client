import type { Locator, Page } from '@playwright/test'

import { expect, plainTest, test } from './test'

/* The transcript against the live source. g6Die8gVFn0 (12:59) has six chapters and dQw4w9WgXcQ none, as youtube.com
   showed them on 2026-11-10. The specs read the lines off the page rather than naming them, so a caption edit upstream
   does not break them. Specs that play and seek far run in plainTest, which upstream lets past its preview limit. */

const player = (page: Page) => page.locator('[data-player-root]')
const video = (page: Page) => player(page).locator('video')
const currentTime = (page: Page) => video(page).evaluate(element => (element as HTMLVideoElement).currentTime)

const openTranscript = async (page: Page, id: string) => {
  await page.goto(`/watch?v=${id}`)
  await expect.poll(() => currentTime(page).catch(() => 0), { timeout: 120_000, message: 'playback did not start' }).toBeGreaterThan(0.5)
  const box = page.locator('main div:has(> .snippet)')
  // on the counts, clear of the links further down
  await box.click({ position: { x: 20, y: 10 } })
  const section = box.locator('section[aria-label="Transcript"]')
  await expect(section.getByRole('heading', { name: 'Transcript' })).toBeVisible()
  await section.getByRole('button', { name: 'Show transcript' }).click()
}

const seek = (page: Page, to: number, play: boolean) => video(page).evaluate((element, [at, playing]) => {
  const media = element as HTMLVideoElement
  media.currentTime = at as number
  if (playing) void media.play()
  else media.pause()
}, [to, play] as const)

const seconds = (time: string) => time.split(':').reduce((total, part) => total * 60 + Number(part), 0)

// the line highlighted, the one youtube.com would highlight at the same moment inside a chapter, and how far down the
// list it sits
const following = (panel: Locator) => panel.locator('.transcript-lines').evaluate((list) => {
  const time = Math.floor(document.querySelector<HTMLVideoElement>('[data-player-root] video')!.currentTime)
  const lines = [...list.querySelectorAll('.transcript-line')]
  const starts = lines.map(line => line.querySelector('.transcript-time')!.textContent!.split(':').reduce((total, part) => total * 60 + Number(part), 0))
  const active = lines.findIndex(line => line.getAttribute('aria-current') === 'true')
  const box = list.getBoundingClientRect()
  const row = lines[active]?.getBoundingClientRect()
  return { active, playing: starts.findLastIndex(start => start <= time), offset: row ? (row.top - box.top) / box.height : undefined }
})

const atTenth = (state: { offset?: number }) => state.offset !== undefined && state.offset > 0.05 && state.offset < 0.15

plainTest('opens from the description beside the player, follows the line playing, and a line or a heading seeks to its start', async ({ page }) => {
  plainTest.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await openTranscript(page, 'g6Die8gVFn0')
  await expect.poll(() => page.evaluate(() => scrollY), { message: 'the page goes back up to the player' }).toBe(0)

  // youtube.com heads the list of a video with chapters "In this video", with a chip for each list
  const panel = page.locator('main aside section[aria-label="Transcript"]')
  await expect(panel.getByRole('heading', { name: 'In this video' })).toBeVisible()
  await expect(panel.getByRole('tab', { name: 'Transcript' })).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('tab', { name: 'Chapters' })).toHaveAttribute('aria-selected', 'false')
  await expect(panel.locator('.transcript-chapter').first()).toHaveText(/^Chapter 1: /)
  expect(await panel.locator('.transcript-line').count()).toBeGreaterThan(50)

  await seek(page, 60, true)
  let state = await following(panel)
  await expect.poll(async () => {
    state = await following(panel)
    return state.active >= 0 && state.active === state.playing && atTenth(state)
  }, { timeout: 30_000, message: 'the line playing is highlighted, a tenth of the way down the list' }).toBe(true)
  const first = state.active
  await expect.poll(async () => {
    state = await following(panel)
    return state.active > first && state.active === state.playing && atTenth(state)
  }, { timeout: 60_000, message: 'the next line takes over as the video plays, and the list follows it' }).toBe(true)

  await video(page).evaluate(element => (element as HTMLVideoElement).pause())
  const target = panel.locator('.transcript-line').nth(state.active + 3)
  const start = seconds((await target.locator('.transcript-time').textContent())!)
  await target.click()
  await expect.poll(() => currentTime(page)).toBeCloseTo(start, 0)
  await expect(target).toHaveAttribute('aria-current', 'true')
  // as on youtube.com, a line leaves a paused video paused
  expect(await video(page).evaluate(element => (element as HTMLVideoElement).paused)).toBe(true)

  // a chapter heading seeks to its chapter, paused as well; the fifth starts at 9:38, before its first line at 9:42,
  // and youtube.com highlights no line until that line starts (measured 2026-11-10)
  await panel.getByRole('button', { name: /^Chapter 5: / }).click()
  await expect.poll(() => currentTime(page)).toBeCloseTo(578, 0)
  expect(await video(page).evaluate(element => (element as HTMLVideoElement).paused)).toBe(true)
  await expect(panel.getByRole('button', { name: /^Chapter 5: / })).toHaveAttribute('aria-current', 'true')
  await expect(panel.locator('.transcript-line[aria-current="true"]')).toHaveCount(0)

  await panel.getByRole('tab', { name: 'Chapters' }).click()
  const chapters = page.locator('main aside section[aria-label="Chapters"]')
  await expect(chapters.getByRole('heading', { name: 'In this video' })).toBeVisible()
  await expect(chapters.locator('.chapter-row')).toHaveCount(6)
  await chapters.getByRole('tab', { name: 'Transcript' }).click()
  await expect(panel).toBeVisible()
})

plainTest('stops following once the list is scrolled until Sync to video time, and searches as youtube.com does', async ({ page }) => {
  plainTest.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await openTranscript(page, 'g6Die8gVFn0')
  const panel = page.locator('main aside section[aria-label="Transcript"]')
  await seek(page, 300, true)
  await expect.poll(async () => atTenth(await following(panel)), { timeout: 30_000 }).toBe(true)

  await panel.locator('.transcript-lines').hover()
  await page.mouse.wheel(0, -800)
  const sync = panel.getByRole('button', { name: 'Sync to video time' })
  await expect(sync).toBeVisible()
  await page.waitForTimeout(3_000)
  expect(atTenth(await following(panel)), 'the list stays where it was scrolled').toBe(false)
  await sync.click()
  await expect(sync).toBeHidden()
  await expect.poll(async () => atTenth(await following(panel)), { timeout: 10_000 }).toBe(true)

  const all = await panel.locator('.transcript-line').count()
  const search = panel.getByRole('textbox', { name: 'Search transcript' })
  await search.fill('OLED')
  await search.press('Enter')
  await expect.poll(() => panel.locator('.transcript-line').count(), { timeout: 30_000 }).toBeLessThan(all)
  for (const line of await panel.locator('.transcript-line').allTextContents()) expect(line).toMatch(/oled/i)
  await search.fill('zzqqxxnothing')
  await search.press('Enter')
  await expect(panel.getByText('No results found.')).toBeVisible({ timeout: 30_000 })
  await panel.getByRole('button', { name: 'Clear' }).click()
  await expect(panel.locator('.transcript-line')).toHaveCount(all)
})

test('opens under the player at 412 px, headed Transcript with no chips for a video without chapters', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 412, height: 860 })
  await openTranscript(page, 'dQw4w9WgXcQ')
  const panel = page.locator('main .panel-slot section[aria-label="Transcript"]')
  await expect(panel.getByRole('heading', { name: 'Transcript' })).toBeVisible()
  await expect(panel.getByRole('tab')).toHaveCount(0)
  await expect(panel.locator('.transcript-chapter')).toHaveCount(0)
  await expect.poll(() => panel.locator('.transcript-line').count(), { timeout: 30_000 }).toBeGreaterThan(10)
  const [frame, list, title] = await Promise.all([player(page).boundingBox(), panel.boundingBox(), page.locator('main h1.title').boundingBox()])
  expect(list!.y).toBeGreaterThan(frame!.y + frame!.height)
  expect(list!.y + list!.height).toBeLessThan(title!.y)
  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(panel).toHaveCount(0)
})

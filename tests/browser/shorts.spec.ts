import type { Locator, Page } from '@playwright/test'

import { PLAYBACK_REFUSED } from '../../src/frame/protocol'
import { expect, hideFknNotice, plainTest, test } from './test'

// the refusal yt-client was given for the Short aOAe17zPggA on 2026-11-10
const REFUSAL = `${PLAYBACK_REFUSED}${JSON.stringify({ title: 'Video unavailable', description: 'The uploader has not made this video available in your country', final: true })}`

// a Short with a long life and a title, which stays up as youtube.com's feed changes
const NAMED_SHORT = 'y2Vqj-59Hqc'

type Refused = { refusedShort?: string }

// answers the first video's openPlayback, and every later ask for it, with the refusal instead of asking the frame
const refuseFirstShort = (reply: string) => {
  if (window.top !== window) return
  const state = window as unknown as Refused
  const post = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'postMessage')!.value as (this: MessagePort, message: unknown, ...rest: unknown[]) => void
  MessagePort.prototype.postMessage = function (this: MessagePort, message: unknown, ...rest: unknown[]) {
    const request = message as { id?: number, method?: string, args?: unknown[] } | null
    if (request?.method !== 'openPlayback') return post.call(this, message, ...rest)
    state.refusedShort ??= String(request.args?.[0])
    if (request.args?.[0] !== state.refusedShort) return post.call(this, message, ...rest)
    setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { id: request.id, error: reply } })), 0)
  } as typeof MessagePort.prototype.postMessage
}

const shownShort = (page: Page) => new URL(page.url()).pathname.replace('/shorts/', '')

const playing = (slide: Locator) =>
  expect.poll(() => slide.locator('video').evaluate(video => {
    const element = video as HTMLVideoElement
    return element.paused ? 0 : element.currentTime
  }, undefined, { timeout: 1_000 }).catch(() => 0), { timeout: 120_000 }).toBeGreaterThan(0.3)

const center = async (locator: Locator) => {
  const box = (await locator.boundingBox())!
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
}

test('at phone width each Short\'s buttons sit on it, and Comments opens a sheet', async ({ page }) => {
  test.setTimeout(240_000)
  await hideFknNotice(page)
  await page.setViewportSize({ width: 412, height: 860 })
  await page.goto('/shorts')
  const slides = page.locator('[data-short-id]')
  await expect(slides.nth(1)).toBeAttached({ timeout: 120_000 })

  for (const index of [0, 1]) {
    const slide = slides.nth(index)
    const id = (await slide.getAttribute('data-short-id'))!
    await slide.evaluate(element => element.scrollIntoView())
    await expect.poll(() => shownShort(page)).toBe(id)
    const stage = (await slide.locator('.stage').boundingBox())!
    for (const name of ['Like', 'Dislike', 'Comments']) {
      const { x, y } = await center(slide.getByRole('button', { name, exact: true }))
      expect(x, `${name} of Short ${index + 1} is off its video`).toBeGreaterThan(stage.x)
      expect(x).toBeLessThan(stage.x + stage.width)
      expect(y, `${name} of Short ${index + 1} is off its video`).toBeGreaterThan(stage.y)
      expect(y).toBeLessThan(stage.y + stage.height)
      const owner = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('[data-short-id]')?.getAttribute('data-short-id'), [x, y])
      expect(owner, `a tap on ${name} of Short ${index + 1} reaches another Short`).toBe(id)
    }
  }

  const slide = slides.nth(1)
  const { x, y } = await center(slide.getByRole('button', { name: 'Comments' }))
  await page.mouse.click(x, y)
  const sheet = slide.getByRole('complementary', { name: 'Comments' })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.comment-text, .disabled-notice').first()).toBeVisible({ timeout: 60_000 })
  const box = (await sheet.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(412)
  const middle = await center(sheet)
  expect(await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x!, y!)?.closest('aside')), [middle.x, middle.y])).toBe(true)

  // a tap beside the sheet closes it, the way youtube.com's does
  await page.mouse.click(206, Math.round(box.y / 2))
  await expect(sheet).toBeHidden()
  expect(shownShort(page)).toBe(await slide.getAttribute('data-short-id'))
})

plainTest('a Short YouTube refuses is passed over for the next one', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(refuseFirstShort, REFUSAL)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/shorts')
  await expect.poll(() => page.evaluate(() => (window as unknown as Refused).refusedShort), { timeout: 120_000 }).toBeTruthy()
  const refused = (await page.evaluate(() => (window as unknown as Refused).refusedShort))!

  await expect(page.locator(`[data-short-id="${refused}"]`)).toHaveCount(0, { timeout: 30_000 })
  await expect.poll(() => shownShort(page)).not.toBe(refused)
  await playing(page.locator(`[data-short-id="${shownShort(page)}"]`))
  await expect(page.getByText('Video unavailable')).toHaveCount(0)
})

test('a refused Short the address names says so in the middle, off its title', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(refuseFirstShort, REFUSAL)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`/shorts/${NAMED_SHORT}`)
  const slide = page.locator(`[data-short-id="${NAMED_SHORT}"]`)
  const status = slide.locator('.status')
  await expect(status).toHaveText('Video unavailable', { timeout: 120_000 })
  await expect(slide.locator('.views')).toBeVisible({ timeout: 60_000 })
  const [line, title] = await Promise.all([status.boundingBox(), slide.locator('.short-title').boundingBox()])
  expect(line!.y + line!.height, 'the refusal runs into the title').toBeLessThanOrEqual(title!.y)
  expect(shownShort(page)).toBe(NAMED_SHORT)
})

plainTest('the arrow keys move between Shorts as soon as one plays, without a click', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/shorts')
  await expect(page).toHaveURL(/\/shorts\/[\w-]{11}$/, { timeout: 120_000 })
  // whichever Short is up once one plays, since a refused one is passed over
  await expect.poll(() => page.locator(`[data-short-id="${shownShort(page)}"] video`).evaluate(video => {
    const element = video as HTMLVideoElement
    return !element.paused && element.currentTime > 0.3
  }, undefined, { timeout: 1_000 }).catch(() => false), { timeout: 120_000 }).toBe(true)
  const firstId = shownShort(page)
  const first = page.locator(`[data-short-id="${firstId}"]`)
  const nextId = (await page.locator(`[data-short-id="${firstId}"] + [data-short-id]`).getAttribute('data-short-id'))!

  await page.keyboard.press('ArrowDown')
  await expect.poll(() => shownShort(page), { timeout: 10_000 }).toBe(nextId)
  await playing(page.locator(`[data-short-id="${nextId}"]`))

  await page.keyboard.press('ArrowUp')
  await expect.poll(() => shownShort(page), { timeout: 10_000 }).toBe(firstId)
  await playing(first)
})

import type { Frame, Page } from '@playwright/test'

import { expect, test } from './test'

/* Leaving a video while one of its segments downloads cancels that request on purpose: the frame answers it as failed and
   logs nothing. `dQw4w9WgXcQ` is a 213 s static video with a related list. */

const VIDEO_ID = 'dQw4w9WgXcQ'

const frameCall = (frame: Frame) => frame.evaluate(() => document.documentElement.dataset.frameApi).catch(() => undefined)

// the engine frame, which marks each call it serves on its <html>
const engineFrame = async (page: Page) => {
  for (const frame of page.frames()) {
    if (frame !== page.mainFrame() && await frameCall(frame)) return frame
  }
  throw new Error('no engine frame')
}

// every call mark the frame sets from now on, read back with `marks`
const recordMarks = (frame: Frame) => frame.evaluate(() => {
  const marks: string[] = []
  Object.assign(window, { marks })
  new MutationObserver((records) => {
    for (const record of records) marks.push(record.oldValue ?? '')
  }).observe(document.documentElement, { attributeFilter: ['data-frame-api'], attributeOldValue: true })
})

const marks = (frame: Frame) => frame.evaluate(() => [
  ...(window as unknown as { marks: string[] }).marks,
  document.documentElement.dataset.frameApi ?? '',
])

test('leaving a video mid-download logs no failed segment request', async ({ page }) => {
  test.setTimeout(240_000)
  const failures: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('requestSegment failed')) failures.push(message.text())
  })
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = page.locator('video')
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 120_000 }).toBeGreaterThan(0)
  const related = page.locator('main aside article a[href^="/watch"]').first()
  await expect(related).toBeVisible({ timeout: 60_000 })
  const frame = await engineFrame(page)
  await recordMarks(frame)

  await expect.poll(() => frameCall(frame), { timeout: 60_000, intervals: [20] }).toBe('requestSegment')
  await related.click()
  // the frame answered the request it was serving as failed: it was cancelled
  await expect.poll(() => marks(frame), { timeout: 10_000 }).toContain('requestSegment:error')
  await page.waitForTimeout(2_000)
  expect(failures).toEqual([])
})

import type { BrowserContext, Page } from '@playwright/test'

import { expect, test } from './test'

/* `kJQP7kiw5Fk` is enforced: in a browser that announces automation, YouTube refuses its stream after a far seek, to
   every new session too (YTB-28), so the player's whole retry ladder runs. */

const VIDEO_ID = 'kJQP7kiw5Fk'

// every read of the video's watch page, by the time it was asked, whatever address it went through
const watchReads = (context: BrowserContext) => {
  const reads: number[] = []
  context.on('request', (request) => {
    let url = request.url()
    for (let pass = 0; pass < 3 && /%2F|%3A|%3F/i.test(url); pass += 1) url = decodeURIComponent(url)
    if (url.includes(`youtube.com/watch?v=${VIDEO_ID}`)) reads.push(Date.now())
  })
  return reads
}

// the frame's note of a stream it had to replace, which a refused far seek always leaves
const frameRecovery = async (page: Page) => {
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue
    const value = await frame.locator('html').getAttribute('data-segment-recovery', { timeout: 1_000 }).catch(() => null)
    if (value) return value
  }
  return null
}

test('a refused video is tried again a few times, then says so once, with Retry', async ({ page, context }) => {
  test.setTimeout(300_000)
  const reads = watchReads(context)
  let errors = 0
  page.on('console', (message) => { if (message.type() === 'error') errors += 1 })
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = page.locator('video')
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 120_000 }).toBeGreaterThan(1)
  await video.evaluate((element) => { (element as HTMLVideoElement).currentTime = 150 })
  const recovery = await expect.poll(() => frameRecovery(page), { timeout: 90_000 }).not.toBeNull().then(() => true, () => false)
  test.skip(!recovery, 'YouTube served the far seek, so there was no refused stream to back off from')

  const status = page.locator('.playback-status')
  await expect(status).toContainText('This video can\'t be played right now', { timeout: 200_000 })
  const retry = page.getByRole('button', { name: 'Retry' })
  await expect(retry).toBeVisible()
  // the open, then one refresh per try: never a read every few seconds
  expect(reads.length).toBeLessThanOrEqual(12)
  const stopped = reads.length
  const errorsAtStop = errors
  await page.waitForTimeout(20_000)
  expect(reads).toHaveLength(stopped)
  // nothing is left asking the refused session: a player left running asks it again at once, logging each answer
  expect(errors - errorsAtStop).toBeLessThan(5)

  await retry.click()
  await expect(retry).toBeHidden()
  await expect.poll(() => reads.length, { timeout: 60_000 }).toBeGreaterThan(stopped)
})

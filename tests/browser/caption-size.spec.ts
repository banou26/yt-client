import type { Page } from '@playwright/test'

import { cueReader, holdOnCue } from './cues'
import { expect, plainTest as test } from './test'

/* The caption size keys against the live source: `dQw4w9WgXcQ` publishes an authored English track. */

const VIDEO = '/watch?v=dQw4w9WgXcQ'

const startPlayback = async (page: Page) => {
  await page.goto(VIDEO)
  await page.waitForFunction(() => performance.getEntriesByName('yt:first-frame', 'mark').length > 0, null, { timeout: 120_000 })
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('yt-client:settings') ?? '{}').captionSize)

// a key that changes nothing, or shows no sample, has no event to wait for, and a waiting assertion would outlast the
// 1 s sample, so these read once a moment after the key
const settle = (page: Page) => page.waitForTimeout(300)

test('+ and - step the captions through youtube.com\'s sizes, on or off, and the size stays for the next visit', async ({ page }) => {
  test.setTimeout(300_000)
  await startPlayback(page)
  await page.getByRole('button', { name: 'Turn on captions' }).click()
  await holdOnCue(page)
  const cue = await cueReader(page)
  await expect.poll(async () => (await cue())?.size, { timeout: 30_000 }).toBe(100)
  const { base } = (await cue())!
  const sample = page.getByText('Captions look like this', { exact: true })
  await expect(sample).toHaveCount(0)

  // with a cue on screen, the cue itself takes the new size at once and no sample shows
  await page.keyboard.press('Shift+Equal')
  await settle(page)
  expect(await sample.count()).toBe(0)
  expect(await cue()).toMatchObject({ size: 150, visibility: 'visible' })
  expect(await stored(page)).toBe(150)

  await page.keyboard.press('Equal')
  await settle(page)
  expect((await cue())?.size).toBe(200)
  // at the top step nothing changes
  await page.keyboard.press('Shift+Equal')
  await settle(page)
  expect((await cue())?.size).toBe(200)
  // the numpad's keys are not these
  await page.keyboard.press('NumpadSubtract')
  await settle(page)
  expect((await cue())?.size).toBe(200)

  await page.keyboard.press('Minus')
  await page.keyboard.press('Shift+Minus')
  await page.keyboard.press('Minus')
  await settle(page)
  expect(await cue()).toMatchObject({ size: 50, visibility: 'visible' })
  expect(await sample.count()).toBe(0)
  expect(await stored(page)).toBe(50)

  // with captions off the keys still size them, and a sample shows what they will look like, except at a limit
  await page.keyboard.press('c')
  await expect(page.getByRole('button', { name: 'Turn on captions' })).toBeVisible()
  await page.keyboard.press('Minus')
  await settle(page)
  expect(await sample.count()).toBe(0)
  await page.keyboard.press('Shift+Equal')
  await expect(sample).toBeVisible()
  await page.keyboard.press('Shift+Equal')
  expect(await sample.evaluate(element => parseFloat(getComputedStyle(element).fontSize)) / base).toBeCloseTo(1.5, 1)
  await expect(sample).toBeHidden({ timeout: 3_000 })
  expect(await stored(page)).toBe(150)

  await page.keyboard.press('Shift+Slash')
  const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(shortcuts.locator('.row')).toContainText([
    'Rotate through font sizes (increasing)+',
    'Rotate through font sizes (decreasing)-',
  ])
  await page.keyboard.press('Escape')

  await startPlayback(page)
  await page.getByRole('button', { name: 'Turn on captions' }).click()
  await holdOnCue(page)
  const next = await cueReader(page)
  await expect.poll(async () => (await next())?.size, { timeout: 30_000 }).toBe(150)
})

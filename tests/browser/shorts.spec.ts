import type { Locator, Page } from '@playwright/test'

import { expect, hideFknNotice, test } from './test'

const shownShort = (page: Page) => new URL(page.url()).pathname.replace('/shorts/', '')

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

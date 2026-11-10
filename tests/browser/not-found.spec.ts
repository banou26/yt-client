import type { Locator } from '@playwright/test'

import { expect, test } from './test'

/* youtube.com's 404 page, as measured on 2026-11-10: a 186 x 174 picture 10 px above two lines, then a 440 px row 25 px
   under them with the logo and a search box, which searches what is typed and does nothing while empty */

const box = async (locator: Locator) => {
  const found = await locator.boundingBox()
  if (!found) throw new Error(`${locator.toString()} is not laid out`)
  return found
}

const LINES = ['This page isn\'t available. Sorry about that.', 'Try searching for something else.']

test('an unknown address shows youtube.com\'s 404 page, whose box searches', async ({ page }) => {
  await page.goto('/nope-page-xyz')
  const main = page.getByRole('main')
  const lines = main.locator('p')
  await expect(lines).toHaveText(LINES, { timeout: 30_000 })

  const picture = await box(main.locator('svg.illustration'))
  expect([picture.width, picture.height]).toEqual([186, 174])
  const [first, second] = [await box(lines.nth(0)), await box(lines.nth(1))]
  expect(first.y - (picture.y + picture.height)).toBeCloseTo(10, 0)
  const mainBox = await box(main)
  expect(Math.abs(picture.x + picture.width / 2 - (mainBox.x + mainBox.width / 2))).toBeLessThanOrEqual(1)

  const input = main.getByRole('textbox', { name: 'Search', exact: true })
  const button = main.getByRole('button', { name: 'Search', exact: true })
  const logo = await box(main.getByRole('link', { name: 'yt-client home', exact: true }))
  const [inputBox, buttonBox] = [await box(input), await box(button)]
  expect(inputBox.y - (second.y + second.height)).toBeCloseTo(25, 0)
  expect(buttonBox.x + buttonBox.width - logo.x).toBeCloseTo(440, 0)

  await button.click()
  await expect(page).toHaveURL('/nope-page-xyz')
  await input.fill('lofi beats')
  await input.press('Enter')
  await expect(page).toHaveURL('/results?search_query=lofi+beats')
})

test('the 404 page fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/nope-page-xyz')
  await expect(page.getByRole('main').locator('p')).toHaveText(LINES, { timeout: 30_000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
})

import { expect, test } from './test'

/* youtube.com's Skip navigation, as measured on 2026-11-10: the Tab stop after the Guide button and the logo, off the
   page until focused, then a 40 px pill 12 px from the top and 6 px after the logo; Enter puts the focus on the page's
   first control, past the header and the guide */

test('Skip navigation shows on keyboard focus and moves the focus to the page\'s first control', async ({ page }) => {
  await page.goto('/settings')
  const main = page.getByRole('main')
  const deviceTheme = main.getByRole('button', { name: 'Device theme', exact: true })
  await expect(deviceTheme).toBeVisible({ timeout: 30_000 })
  const skip = page.getByRole('button', { name: 'Skip navigation', exact: true })
  await expect(skip).not.toBeInViewport()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Guide', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  const logo = page.getByRole('link', { name: 'yt-client home', exact: true })
  await expect(logo).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  const [skipBox, logoBox] = [await skip.boundingBox(), await logo.boundingBox()]
  if (!skipBox || !logoBox) throw new Error('Skip navigation or the logo is not laid out')
  expect([skipBox.y, skipBox.height]).toEqual([12, 40])
  expect(skipBox.x - (logoBox.x + logoBox.width)).toBeCloseTo(6, 0)

  await page.keyboard.press('Enter')
  await expect(deviceTheme).toBeFocused()
  await expect(skip).not.toBeInViewport()
  await page.keyboard.press('Tab')
  await expect(main.getByRole('button', { name: 'Dark', exact: true })).toBeFocused()
})

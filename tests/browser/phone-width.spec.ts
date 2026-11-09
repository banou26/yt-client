import { expect, test } from './test'

test('searches from the header\'s search icon at a phone\'s width', async ({ page }) => {
  test.setTimeout(180_000)
  const input = page.getByRole('combobox', { name: 'Search' })
  const home = page.getByRole('link', { name: 'yt-client home' })

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await expect(input).toBeVisible()
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)

  await page.setViewportSize({ width: 412, height: 860 })
  await expect(home).toBeVisible()
  // the header is final once the session is known: before that it also holds the notifications bell
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 90_000 })
  await expect(page.getByRole('button', { name: 'Notifications' })).toHaveCount(0, { timeout: 30_000 })
  const signIn = await page.getByRole('button', { name: 'Sign in' }).boundingBox()
  expect(signIn!.x + signIn!.width, 'Sign in runs off the header').toBeLessThanOrEqual(412)

  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(home).toBeHidden()
  await expect(input).toBeFocused()
  expect((await page.getByRole('search').boundingBox())!.width).toBeGreaterThan(300)
  await input.fill('rick astley')
  await input.press('Enter')
  await expect(page).toHaveURL(/\/results\?search_query=rick%20astley$/)
  await expect(input).toHaveValue('rick astley')

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(input).toBeHidden()
  await expect(home).toBeVisible()
})

test('fits the watch page in a phone\'s width', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/watch?v=dQw4w9WgXcQ')
  const meta = page.locator('.meta').filter({ has: page.locator('a.hashtag') })
  await expect(meta).toBeVisible({ timeout: 150_000 })
  await expect(page.locator('aside.secondary article').first()).toBeVisible({ timeout: 150_000 })
  expect((await meta.boundingBox())!.height, 'the views, date and hashtags take more than one line at 1280').toBe(20)

  await page.setViewportSize({ width: 412, height: 860 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
})

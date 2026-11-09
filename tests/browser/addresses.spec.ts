import { expect, test } from './test'

/* youtube.com answers each of these addresses with a page of its own, checked headless on 2026-11-10. This client keeps
   most of those pages under another route, so the address either bounces there or opens the same page in place. */

test('opens /c/<name> on the channel, and its tabs under the same address', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/c/mkbhd')
  await expect(page.locator('main h1')).toHaveText('Marques Brownlee', { timeout: 120_000 })
  await expect(page).toHaveURL('/c/mkbhd')
  await page.getByRole('navigation', { name: 'Channel sections' }).getByRole('button', { name: 'Videos', exact: true }).click()
  await expect(page).toHaveURL('/c/mkbhd?tab=VIDEOS')
  await expect(page.locator('main article a[href^="/watch?v="]').first()).toBeVisible({ timeout: 120_000 })
})

test('opens /user/<name> on the channel, and /user/<name>/<tab> on that tab', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/user/marquesbrownlee/videos')
  await expect(page).toHaveURL('/user/marquesbrownlee?tab=VIDEOS')
  await expect(page.locator('main h1')).toHaveText('Marques Brownlee', { timeout: 120_000 })
  const tabs = page.getByRole('navigation', { name: 'Channel sections' })
  await expect(tabs.getByRole('button', { name: 'Videos', exact: true })).toHaveAttribute('aria-current', 'page')
})

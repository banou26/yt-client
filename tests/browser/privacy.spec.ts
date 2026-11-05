import { expect, test } from '@playwright/test'

import { DIRECT_HOSTS, FKN_DOMAINS } from '../../src/privacy-hosts'

// the guide shows its footer expanded, which needs a viewport wider than 1312px
test.use({ viewport: { width: 1440, height: 900 } })

test('Settings links the privacy page, which lists every server the browser reaches itself', async ({ page }) => {
  await page.goto('/settings')
  await page.locator('main').getByRole('link', { name: 'What yt-client keeps and where requests go' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.locator('main h1')).toHaveText('Privacy')
  await expect(page).toHaveTitle(/^Privacy - /)

  await expect(page.locator('[data-direct-hosts] li')).toHaveText(DIRECT_HOSTS.map(({ what, domain }) => `${what}: ${domain}`))
  const main = page.locator('main')
  await expect(main).toContainText(`FKN's own servers (${FKN_DOMAINS.join(' and ')})`)
  await expect(main.getByRole('link', { name: 'FKN privacy policy' })).toHaveAttribute('href', 'https://fkn.app/privacy')
  await expect(main.getByRole('link', { name: 'extension privacy policy' })).toHaveAttribute('href', 'https://fkn.app/extension/privacy')
})

test("the guide's footer links the privacy page", async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('navigation', { name: 'Guide' }).getByRole('link', { name: 'Privacy', exact: true }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.locator('main h1')).toHaveText('Privacy')
})

import type { Page } from '@playwright/test'

import type { Selected } from './fixtures/account-harness'

import { expect, test } from './test'

import { BRAND_PAGE_ID } from '../unit/fixtures/accounts-list'

const CHANNEL_KEY = 'yt-client:channel'

const mount = async (page: Page, which: 'menu' | 'page', selected: Selected, brands = 1) => {
  await page.goto('/privacy')
  await page.evaluate(async ([which, selected, brands]) => {
    const harness = '/tests/browser/fixtures/account-harness.tsx'
    const { mountAccountMenu, mountAccountPage } = await import(harness) as typeof import('./fixtures/account-harness')
    if (which === 'menu') mountAccountMenu(selected, brands)
    else mountAccountPage(selected, brands)
  }, [which, selected, brands] as const)
  return page.locator(`[data-account-harness="${which}"]`)
}

// a switch goes home to load every engine again; answered with a 204, the page stays to be read in its switching state
const holdNavigation = async (page: Page) => {
  const home: string[] = []
  await page.route((url) => url.pathname === '/', (route) => {
    home.push(route.request().url())
    return route.fulfill({ status: 204 })
  })
  return home
}

const storedChannel = (page: Page) => page.evaluate((key) => localStorage.getItem(key), CHANNEL_KEY)

test("the account menu offers the account's other channel by its handle, and a switch to it keeps its page ID", async ({ page }) => {
  const harness = await mount(page, 'menu', 'own')
  await harness.getByRole('button', { name: 'Account menu' }).click()
  const menu = harness.getByRole('menu', { name: 'Account' })
  await expect(menu.locator('.account .handle')).toHaveText('@viewer')
  await expect(menu.getByRole('menuitem', { name: 'Your channel' })).toHaveAttribute('href', '/channel/@viewer')
  const rows = menu.locator('button.row')
  await expect(rows).toHaveCount(1)
  await expect(rows.locator('.channel-handle')).toHaveText('@viewer-brand')
  await expect(rows.locator('svg')).toHaveCount(0)

  const home = await holdNavigation(page)
  await rows.click()
  await expect.poll(() => home.length).toBe(1)
  await expect(rows.locator('svg')).toHaveCount(1)
  await expect(rows).toBeDisabled()
  await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeDisabled()
  expect(await storedChannel(page)).toBe(BRAND_PAGE_ID)
})

test("the account menu's switch back to the account's own channel marks its row and holds the others", async ({ page }) => {
  const harness = await mount(page, 'menu', 'brand', 2)
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [CHANNEL_KEY, BRAND_PAGE_ID] as const)
  await harness.getByRole('button', { name: 'Account menu' }).click()
  const menu = harness.getByRole('menu', { name: 'Account' })
  const rows = menu.locator('button.row')
  await expect(rows.locator('.channel-handle')).toHaveText(['@viewer', '@viewer-other'])
  await expect(rows.locator('svg.lucide-check')).toHaveCount(0)

  const home = await holdNavigation(page)
  await rows.nth(0).click()
  await expect.poll(() => home.length).toBe(1)
  await expect(rows.nth(0).locator('svg.lucide-check')).toHaveCount(1)
  await expect(rows.nth(0)).toBeDisabled()
  await expect(rows.nth(1)).toBeDisabled()
  await expect(rows.nth(1).locator('svg.lucide-check')).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeDisabled()
  expect(await storedChannel(page)).toBeNull()
})

test('the account page lists every channel with its handle, the current one marked and not offered', async ({ page }) => {
  const harness = await mount(page, 'page', 'brand')
  const rows = harness.locator('.section', { has: page.getByRole('heading', { name: 'Accounts' }) }).locator('button.row')
  await expect(rows).toHaveCount(2)
  await expect(rows.locator('.channel-handle')).toHaveText(['@viewer', '@viewer-brand'])
  await expect(rows.nth(1)).toContainText('Current')
  await expect(rows.nth(1)).toBeDisabled()
  await expect(rows.nth(0)).not.toContainText('Current')
  await expect(rows.nth(0)).toBeEnabled()
  await expect(harness.locator('.current .handle')).toHaveText('@viewer-brand')
})

test("a switch back to the account's own channel shows on its row, holds every other row, and keeps no channel", async ({ page }) => {
  const harness = await mount(page, 'page', 'brand', 2)
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [CHANNEL_KEY, BRAND_PAGE_ID] as const)
  const rows = harness.locator('.section', { has: page.getByRole('heading', { name: 'Accounts' }) }).locator('button.row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(2)).toBeEnabled()

  const home = await holdNavigation(page)
  await rows.nth(0).click()
  await expect.poll(() => home.length).toBe(1)
  await expect(rows.nth(0)).toContainText('Switching…')
  await expect(rows.nth(0)).toBeDisabled()
  await expect(rows.nth(2)).toBeDisabled()
  await expect(rows.nth(2)).not.toContainText('Switching…')
  await expect(harness.getByRole('button', { name: 'Sign out' })).toBeDisabled()
  expect(await storedChannel(page)).toBeNull()
})

test('signed out, the header offers Sign in and the account page asks to sign in', async ({ page }) => {
  test.setTimeout(150_000)
  await page.goto('/account')
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 90_000 })
  await expect(page.locator('header button.sign-in')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0)
  const main = page.locator('main')
  await expect(main).toContainText('You are not signed in.')
  await expect(main.getByRole('button', { name: 'Sign in' })).toBeVisible()
  expect(await storedChannel(page)).toBeNull()
})

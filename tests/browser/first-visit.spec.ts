import type { Page } from '@playwright/test'

import { expect, test } from './test'

const mountHarness = async (page: Page, path: string, mount: string, argument: boolean) => {
  await page.evaluate(async ({ path, mount, argument }) => {
    const harness = await import(path) as Record<string, (argument: boolean) => void>
    harness[mount]!(argument)
  }, { path, mount, argument })
}

const engineReady = async (page: Page) => {
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 90_000 })
}

test('signed out, the guide keeps You and History beside a Sign in button, and its footer has only links', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/feed/you')
  // the You page asks to sign in only once the session has answered, so the guide below is the signed-out one
  await expect(page.locator('main').getByRole('heading', { name: 'Enjoy your favorite videos' })).toBeVisible({ timeout: 90_000 })

  const guide = page.getByRole('navigation', { name: 'Guide' })
  for (const [label, href] of [['Home', '/'], ['Shorts', '/shorts'], ['Subscriptions', '/feed/subscriptions'], ['You', '/feed/you'], ['History', '/feed/history']]) {
    await expect(guide.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', href!)
  }
  await expect(guide.getByRole('button', { name: 'Sign in' })).toBeVisible()
  for (const label of ['Playlists', 'Watch later', 'Liked videos']) {
    await expect(guide.getByRole('link', { name: label, exact: true })).toHaveCount(0)
  }

  for (const label of ['About', 'Press', 'Contact', 'Terms', 'Developers']) {
    await expect(guide.getByText(label, { exact: true })).toHaveCount(0)
  }
  await expect(guide.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute('href', '/privacy')
})

test('signed in, the guide keeps its You section and asks no one to sign in', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1600, height: 900 })
  await engineReady(page)
  await mountHarness(page, '/tests/browser/fixtures/guide-harness.tsx', 'mountGuide', true)
  await mountHarness(page, '/tests/browser/fixtures/guide-harness.tsx', 'mountGuide', false)

  const signedIn = page.locator('[data-guide-harness="signed-in"]')
  await expect(signedIn.getByRole('link', { name: 'Liked videos', exact: true })).toBeVisible()
  for (const label of ['You', 'History', 'Playlists', 'Watch later']) {
    await expect(signedIn.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  await expect(signedIn.getByRole('button', { name: 'Sign in' })).toHaveCount(0)

  const signedOut = page.locator('[data-guide-harness="signed-out"]')
  await expect(signedOut.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(signedOut.getByRole('link', { name: 'Watch later', exact: true })).toHaveCount(0)
})

test('an empty Home has no lone All chip, and a Home with filters keeps All first', async ({ page }) => {
  test.setTimeout(180_000)
  await engineReady(page)
  await mountHarness(page, '/tests/browser/fixtures/home-harness.tsx', 'mountHome', false)
  await mountHarness(page, '/tests/browser/fixtures/home-harness.tsx', 'mountHome', true)

  const empty = page.locator('[data-home-harness="empty"]')
  await expect(empty.getByRole('heading', { name: 'Try searching to get started' })).toBeVisible()
  await expect(empty.getByRole('button', { name: 'All', exact: true })).toBeHidden()

  const filtered = page.locator('[data-home-harness="filters"]')
  await expect(filtered.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(filtered.getByRole('button', { name: 'All', exact: true })).toBeVisible()
  await expect(filtered.getByRole('button', { name: 'Music', exact: true })).toBeVisible()
})

test('the header menu opens the keyboard shortcuts, Shift+P among them', async ({ page }) => {
  await page.goto('/settings')
  const more = page.getByRole('button', { name: 'More', exact: true })
  await more.click()
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click()
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.row').filter({ hasText: 'Previous video' })).toContainText('Shift+P')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(more).toBeFocused()
})

// Lex Fridman's deep learning lectures: every row is one verified channel's
test('playlist rows carry the channel badge and a ⋮ menu without a hover', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')
  const row = page.locator('.rows .row').first()
  await expect(row).toBeVisible({ timeout: 120_000 })
  await expect(row.locator('svg[data-badge="verified"]')).toBeVisible()

  await page.mouse.move(0, 0)
  const more = row.getByRole('button', { name: /^More actions for / })
  await expect.poll(() => more.evaluate(button => getComputedStyle(button).opacity)).toBe('1')
  await more.click()
  await expect(page.getByRole('menuitem', { name: 'Save to Watch later' })).toBeVisible()
})

import type { Page } from '@playwright/test'

import { expect, test } from './test'

// the search route's own code: its source module under vite dev, its chunk in a build
const SEARCH_CODE = /\/src\/routes\/search\.tsx|\/assets\/search-[\w-]+\.js/

const OFFLINE_LINE = 'You\'re offline. Check your connection.'

// a full reload would also show the page, so this marker proves the page recovered in place
const openSettings = async (page: Page) => {
  await page.goto('/settings')
  await page.evaluate(() => Object.assign(window, { sameDocument: true }))
}

const search = async (page: Page) => {
  const input = page.getByRole('combobox', { name: 'Search' })
  await input.fill('rick astley')
  await input.press('Enter')
  await expect(page).toHaveURL(/\/results\?search_query=rick(%20|\+)astley$/)
}

const expectSearchPage = async (page: Page) => {
  await expect(page.getByRole('heading', { name: 'Results for rick astley' })).toBeAttached({ timeout: 30_000 })
  await expect(page.locator('.filter-chip').first()).toHaveText('All')
  expect(await page.evaluate(() => 'sameDocument' in window), 'the page reloaded').toBe(true)
}

test('a page whose code failed to download says so in one line and loads on Try again', async ({ page }) => {
  await page.route(SEARCH_CODE, route => route.abort('internetdisconnected'), { times: 1 })
  await openSettings(page)
  await search(page)

  const alert = page.getByRole('alert')
  await expect(alert.locator('p')).toHaveText(OFFLINE_LINE, { timeout: 30_000 })
  await expect(alert).not.toContainText('import')

  await alert.getByRole('button', { name: 'Try again' }).click()
  await expectSearchPage(page)
})

test('a page whose code failed to download while offline loads once the browser is back online', async ({ page, context }) => {
  await openSettings(page)
  await context.setOffline(true)
  await search(page)
  await expect(page.getByRole('alert').locator('p')).toHaveText(OFFLINE_LINE, { timeout: 30_000 })

  await context.setOffline(false)
  await expectSearchPage(page)
})

test('a connection that comes back as the line shows still loads the page', async ({ page }) => {
  await page.route(SEARCH_CODE, route => route.abort('internetdisconnected'), { times: 1 })
  await openSettings(page)
  // a mutation observer runs right after the render that put the line in, before any effect that waits for a paint
  await page.evaluate(() => {
    new MutationObserver((_, observer) => {
      if (!document.querySelector('[role="alert"]')) return
      observer.disconnect()
      Object.assign(window, { lineShown: true })
      dispatchEvent(new Event('online'))
    }).observe(document.body, { childList: true, subtree: true })
  })
  await search(page)
  await expectSearchPage(page)
  expect(await page.evaluate(() => 'lineShown' in window), 'the download never failed').toBe(true)
})

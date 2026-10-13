import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'

/* exposure is simulated through the extension's page-visible contract, `data-fkn-extension` on <html>, as
   extension-notice.spec.ts does; the import itself needs the real extension and is driven outside this suite */

const exposeExtension = (page: Page) =>
  page.addInitScript(() => {
    const mark = () => {
      document.documentElement.dataset.fknExtension = 'true'
    }
    if (document.documentElement) return mark()
    new MutationObserver((_, observer) => {
      if (!document.documentElement) return
      mark()
      observer.disconnect()
    }).observe(document, { childList: true })
  })

const signInOf = (page: Page) => page.getByRole('main').getByRole('button', { name: 'Sign in' })
const importOf = (page: Page) => page.getByRole('button', { name: 'Import from YouTube on this browser' })

const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// the record src/history/store.ts keeps: database yt-client-history, store imports, key browser
const keepCopy = (page: Page, entries: unknown[]) => page.evaluate((entries) => new Promise<void>((resolve, reject) => {
  const open = indexedDB.open('yt-client-history', 1)
  open.onupgradeneeded = () => open.result.createObjectStore('imports')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const transaction = open.result.transaction('imports', 'readwrite')
    transaction.objectStore('imports').put({ importedAt: Date.now(), entries }, 'browser')
    transaction.oncomplete = () => {
      open.result.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  }
}), entries)

const databases = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map(({ name }) => name))

test('offers the import when signed out with the extension on Chromium', async ({ page }) => {
  await exposeExtension(page)
  await page.goto('/feed/history')
  await expect(signInOf(page)).toBeVisible({ timeout: 60_000 })
  await expect(importOf(page)).toBeVisible()
})

test('offers no import without the extension', async ({ page }) => {
  await page.goto('/feed/history')
  await expect(signInOf(page)).toBeVisible({ timeout: 60_000 })
  // past the exposure grace, after which an absent extension is final
  await page.waitForTimeout(1_500)
  await expect(importOf(page)).toHaveCount(0)
  expect(await databases(page)).not.toContain('yt-client-history')
})

test('shows a kept copy under its days, and one control deletes it', async ({ page }) => {
  await page.goto('/feed/history')
  await expect(signInOf(page)).toBeVisible({ timeout: 60_000 })
  await keepCopy(page, [
    { id: 'jNQXAC9IVRw', title: 'Me at the zoo', durationSeconds: 19, progressPercent: 10, channel: { id: 'UC4QobU6STFB0P71PMvOGN5A', name: 'jawed' }, watchedOn: today() },
    { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', channel: { id: 'UCuAXFkgsw1L7xaCfnd5JJOw', name: 'Rick Astley' }, watchedOn: '2024-09-28' },
    { id: 'C0DPdy98e4c', title: 'TEST VIDEO', heading: 'Last week' },
  ])
  await page.reload()

  const main = page.getByRole('main')
  await expect(main.locator('.section-title')).toHaveText(['Today', 'Sep 28, 2024', 'Last week'], { timeout: 60_000 })
  await expect(main.locator('a[href="/watch?v=jNQXAC9IVRw"]').first()).toBeVisible()
  await expect(main.getByRole('link', { name: 'jawed' })).toHaveAttribute('href', '/channel/UC4QobU6STFB0P71PMvOGN5A')
  await expect(signInOf(page)).toHaveCount(0)

  await main.getByRole('button', { name: 'Delete imported history' }).click()
  await expect(signInOf(page)).toBeVisible()
  await expect(main.locator('.section-title')).toHaveCount(0)
  await expect.poll(() => databases(page)).not.toContain('yt-client-history')

  await page.reload()
  await expect(signInOf(page)).toBeVisible({ timeout: 60_000 })
  await expect(main.locator('.section-title')).toHaveCount(0)
})

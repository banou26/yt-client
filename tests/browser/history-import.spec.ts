import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'

/* exposure is simulated through the extension's page-visible contract, `data-fkn-extension` on <html>, as
   extension-notice.spec.ts does; the import itself runs through the real extension in history-import-extension.spec.ts */

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

// the record src/history/store.ts keeps: database yt-client-history, store imports, key browser
const keepCopy = (page: Page, entries: unknown[]) => page.evaluate((entries) => new Promise<void>((resolve, reject) => {
  const open = indexedDB.open('yt-client-history', 1)
  open.onupgradeneeded = () => open.result.createObjectStore('imports')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const transaction = open.result.transaction('imports', 'readwrite')
    transaction.objectStore('imports').put({ importedAt: Date.now(), session: 'a-session-digest', entries }, 'browser')
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

test('offers no import with the extension on a browser that is not Chromium', async ({ page }) => {
  await exposeExtension(page)
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined }))
  await page.goto('/feed/history')
  await expect(signInOf(page)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('html')).toHaveAttribute('data-fkn-extension', 'true')
  await page.waitForTimeout(1_500)
  await expect(importOf(page)).toHaveCount(0)
})

test('offers no import without the extension', async ({ page }) => {
  await page.goto('/feed/history')
  await expect(signInOf(page)).toBeVisible({ timeout: 60_000 })
  // past the exposure grace, after which an absent extension is final
  await page.waitForTimeout(1_500)
  await expect(importOf(page)).toHaveCount(0)
  expect(await databases(page)).not.toContain('yt-client-history')
})

test('lists no kept copy it cannot match to the browser YouTube session, and one control deletes it', async ({ page }) => {
  await page.goto('/feed/history')
  await expect(signInOf(page)).toBeVisible({ timeout: 60_000 })
  await keepCopy(page, [{ id: 'jNQXAC9IVRw', title: 'Me at the zoo', channel: { id: 'UC4QobU6STFB0P71PMvOGN5A', name: 'jawed' }, heading: 'Last week' }])
  await page.reload()

  const main = page.getByRole('main')
  const deleteControl = main.getByRole('button', { name: 'Delete imported history' })
  await expect(deleteControl).toBeVisible({ timeout: 60_000 })
  await expect(signInOf(page)).toBeVisible()
  await expect(main.locator('a[href="/watch?v=jNQXAC9IVRw"]')).toHaveCount(0)
  await expect(main.locator('.section-title')).toHaveCount(0)

  await deleteControl.click()
  await expect(deleteControl).toHaveCount(0)
  await expect.poll(() => databases(page)).not.toContain('yt-client-history')

  await page.reload()
  await expect(signInOf(page)).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(1_500)
  await expect(deleteControl).toHaveCount(0)
})

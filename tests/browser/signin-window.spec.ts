import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'

// the engine's Scramjet jar, the whole-jar blob every Controller of the origin persists and reloads
const jarHolds = (page: Page, needle: string) => page.evaluate((text) => new Promise<boolean>((resolve) => {
  const request = indexedDB.open('__scramjet_controller')
  request.onerror = () => resolve(false)
  request.onsuccess = () => {
    const db = request.result
    if (!db.objectStoreNames.contains('state')) {
      resolve(false)
      return
    }
    const get = db.transaction('state', 'readonly').objectStore('state').get('cookies')
    get.onsuccess = () => resolve(String((get.result as { cookies?: string } | undefined)?.cookies ?? '').includes(text))
    get.onerror = () => resolve(false)
  }
}), needle)

// Google's form is read from frame CONTENT: a Scramjet frame's url never literally names google
const showsGoogleForm = async (page: Page) => {
  for (const frame of page.frames()) {
    const text = await frame.evaluate(() => document.body?.innerText ?? '').catch(() => '')
    if (/Email or phone/.test(text)) return true
  }
  return false
}

test('signs in through a window of its own, on the engine jar', async ({ page, context }) => {
  test.setTimeout(240_000)
  await page.goto('/watch?v=FAlMdord_Fg')
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.engine), { timeout: 90_000 }).toBe('ready')
  // the control: nothing has reached Google yet, so its cookie is not in the jar
  expect(await jarHolds(page, '__Host-GAPS')).toBe(false)

  const opened = context.waitForEvent('page')
  await page.locator('header button.sign-in').click()
  const popup = await opened
  // a popup's url reads empty at the page event, until its first navigation commits
  await expect(popup).toHaveURL(/\/__yt_scramjet__\/signin\.html$/)
  expect(new URL(page.url()).pathname).toBe('/watch')

  await expect.poll(() => showsGoogleForm(popup), { timeout: 90_000 }).toBe(true)
  // the window's cookies are the engine's, which is how a sign-in there reaches the app
  await expect.poll(() => jarHolds(page, '__Host-GAPS'), { timeout: 15_000 }).toBe(true)

  // the engine keeps its egress port while the window holds one
  await page.locator('header input').fill('blender')
  await page.keyboard.press('Enter')
  await expect.poll(() => page.locator('a[href^="/watch"]').count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(5)
  await popup.close()
})

test('says how to get past a blocked window, and tries again from the toast', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.engine), { timeout: 90_000 }).toBe('ready')
  await page.evaluate(() => {
    const opens = { count: 0 }
    ;(window as unknown as { opens: typeof opens }).opens = opens
    window.open = () => {
      opens.count++
      return null
    }
  })
  await page.locator('header button.sign-in').click()
  const toast = page.locator('.toast', { hasText: 'Allow pop-ups' })
  await expect(toast).toBeVisible()
  await toast.getByRole('button', { name: 'Try again' }).click()
  expect(await page.evaluate(() => (window as unknown as { opens: { count: number } }).opens.count)).toBe(2)
})

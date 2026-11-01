import type { Page } from '@playwright/test'
import type { JarCookie } from '../../src/scramjet/jar'

import { expect, test } from '@playwright/test'

// the engine's Scramjet jar through the app's own reader, so a cookie seen here also proves the reader parses the real jar
const readJar = (page: Page) => page.evaluate(async (path) => {
  const jar = await import(path) as typeof import('../../src/scramjet/jar')
  const cookies = await jar.readJar()
  return { names: cookies.map((cookie: JarCookie) => cookie.name), session: jar.holdsSession(cookies) }
}, '/src/scramjet/jar.ts')

// Google's form is read from frame CONTENT: a Scramjet frame's url never literally names google
const showsGoogleForm = async (page: Page) => {
  for (const frame of page.frames()) {
    const text = await frame.evaluate(() => document.body?.innerText ?? '').catch(() => '')
    if (/Email or phone/.test(text)) return true
  }
  return false
}

const openWindow = async (page: Page) => {
  const opened = page.context().waitForEvent('page')
  await page.locator('header button.sign-in').click()
  const popup = await opened
  // a popup's url reads empty at the page event, until its first navigation commits
  await expect(popup).toHaveURL(/\/__yt_scramjet__\/signin(?:\.html)?$/)
  return popup
}

test('signs in through a window of its own, on the engine jar', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/watch?v=FAlMdord_Fg')
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.engine), { timeout: 90_000 }).toBe('ready')
  // the control: nothing has reached Google yet, so its cookie is not in the jar
  expect((await readJar(page)).names).not.toContain('__Host-GAPS')

  const popup = await openWindow(page)
  expect(new URL(page.url()).pathname).toBe('/watch')

  await expect.poll(() => showsGoogleForm(popup), { timeout: 90_000 }).toBe(true)
  // the window's cookies are the engine's, which is how a sign-in there reaches the app
  await expect.poll(async () => (await readJar(page)).names, { timeout: 15_000 }).toContain('__Host-GAPS')
  // Google's cookies before a sign-in are not a session, so closing the window here would not count as one
  expect((await readJar(page)).session).toBe(false)

  // the engine keeps its egress port while the window holds one: a search answers in about 1 s, and an engine that lost
  // its port stalls about 15 s until its reset, so the bound sits well between the two
  await page.locator('header input').fill('blender')
  await page.keyboard.press('Enter')
  await expect.poll(() => page.locator('a[href^="/watch"]').count(), { timeout: 8_000 }).toBeGreaterThanOrEqual(5)
  await popup.close()
})

test('says sign-in stopped when the app page reloads under the window', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.engine), { timeout: 90_000 }).toBe('ready')
  const popup = await openWindow(page)
  await expect.poll(() => showsGoogleForm(popup), { timeout: 90_000 }).toBe(true)
  const stopped = popup.getByText('Sign-in stopped')
  await expect(stopped).toBeHidden()

  // the window's egress worker lived in the page it came from
  await page.reload()
  await expect(stopped).toBeVisible({ timeout: 5_000 })
  await expect(popup.locator('iframe')).toBeHidden()
  await popup.getByRole('button', { name: 'Close' }).click()
  await expect.poll(() => popup.isClosed()).toBe(true)
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

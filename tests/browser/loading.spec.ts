import type { Page } from '@playwright/test'

import { expect, test } from './test'

// The engine's frame document, held: the page then stays where a slow network leaves it for its first seconds (about
// 15 s on Slow 4G, measured 2026-11-10), with the engine not up and the session unknown.
const holdEngine = async (page: Page) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/__yt_scramjet__/host.html', async (route) => {
    await held
    await route.continue()
  })
  return release
}

const mountHarness = async (page: Page, path: string, mount: string, ...args: unknown[]) => {
  await page.evaluate(async ({ path, mount, args }) => {
    const harness = await import(path) as Record<string, (...args: unknown[]) => void>
    harness[mount]!(...args)
  }, { path, mount, args })
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

test('a search waiting on the engine shows placeholder rows where its results will be', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  const release = await holdEngine(page)
  // the held frame holds back the load event
  await page.goto('/results?search_query=lofi+hip+hop', { waitUntil: 'domcontentloaded' })
  const main = page.getByRole('main')
  const placeholders = main.locator('.result-placeholder')
  await expect(placeholders.first()).toBeVisible({ timeout: 30_000 })
  expect(await placeholders.count()).toBeGreaterThanOrEqual(4)
  await expect(main.getByText('Searching…')).toHaveCount(0)
  const held = (await placeholders.first().locator('.thumb').boundingBox())!
  expect(held.width / held.height).toBeCloseTo(16 / 9, 1)

  release()
  const thumb = main.locator('article.result a.thumb').first()
  await expect(thumb).toBeVisible({ timeout: 90_000 })
  await expect(placeholders).toHaveCount(0)
  const shown = (await thumb.boundingBox())!
  expect(shown.x).toBeCloseTo(held.x, 0)
  expect(shown.width).toBeCloseTo(held.width, 0)
})

test('signed out, the header shows no bell while the session is unknown, and its search box stays put', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  const release = await holdEngine(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const header = page.locator('header')
  const box = page.getByRole('combobox', { name: 'Search' })
  await expect(box).toBeVisible({ timeout: 30_000 })
  await expect(header.getByRole('button', { name: 'Notifications' })).toHaveCount(0)
  // as the guide, it asks no one to sign in before it knows who is there
  await expect(header.getByRole('button', { name: 'Sign in' })).toHaveCount(0)
  const before = await box.boundingBox()

  release()
  await expect(header.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 90_000 })
  await expect(header.getByRole('button', { name: 'Notifications' })).toHaveCount(0)
  expect(await box.boundingBox()).toEqual(before)
})

test('signed in, the bell and the avatar take the places the header held for them', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 90_000 })
  await mountHarness(page, '/tests/browser/fixtures/header-harness.tsx', 'mountHeader', 'pending', 100)
  await mountHarness(page, '/tests/browser/fixtures/header-harness.tsx', 'mountHeader', 'signed-in', 200)

  const pending = page.locator('[data-header-harness="pending"]')
  const signedIn = page.locator('[data-header-harness="signed-in"]')
  const bell = signedIn.getByRole('button', { name: 'Notifications' })
  const avatar = signedIn.getByRole('button', { name: 'Account menu' })
  await expect(bell).toBeVisible()
  await expect(avatar).toBeVisible()
  await expect(pending.getByRole('button', { name: 'Notifications' })).toHaveCount(0)
  await expect(pending.getByRole('button', { name: 'Sign in' })).toHaveCount(0)

  const heldBell = (await pending.locator('.pending-bell').boundingBox())!
  const heldAvatar = (await pending.locator('.pending-avatar').boundingBox())!
  const shownBell = (await bell.boundingBox())!
  const shownAvatar = (await avatar.boundingBox())!
  expect(heldBell.x + heldBell.width / 2).toBeCloseTo(shownBell.x + shownBell.width / 2, 0)
  expect(heldAvatar.x).toBeCloseTo(shownAvatar.x, 0)
  expect(heldAvatar.width).toBeCloseTo(shownAvatar.width, 0)
  expect(await pending.getByRole('combobox', { name: 'Search' }).boundingBox().then((box) => [box!.x, box!.width]))
    .toEqual(await signedIn.getByRole('combobox', { name: 'Search' }).boundingBox().then((box) => [box!.x, box!.width]))
})

test('a thumbnail that failed during a network drop shows its plain slot, and loads when the browser is back online', async ({ page, context }) => {
  test.setTimeout(120_000)
  const asked = new Map<string, number>()
  await page.route('https://i.ytimg.com/vi/harness-*/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/')[2]!
    const count = (asked.get(name) ?? 0) + 1
    asked.set(name, count)
    if (count === 1 || name === 'harness-gone') return route.abort('internetdisconnected')
    return route.fulfill({ contentType: 'image/png', body: PNG })
  })
  await page.goto('/privacy')
  await mountHarness(
    page,
    '/tests/browser/fixtures/thumbnail-harness.tsx',
    'mountThumbnails',
    ['https://i.ytimg.com/vi/harness-drop/hqdefault.jpg', 'https://i.ytimg.com/vi/harness-gone/hqdefault.jpg'],
    'https://i.ytimg.com/vi/harness-related/hqdefault.jpg',
  )
  const thumbnail = (name: string) => page.locator('[data-thumbnail-harness]').locator(`img[src*="/${name}/"]`)
  const [drop, gone, related] = [thumbnail('harness-drop'), thumbnail('harness-gone'), thumbnail('harness-related')]
  await expect.poll(() => asked.size).toBe(3)
  // the slot's own background in place of the browser's broken-image icon
  for (const failed of [drop, gone, related]) await expect(failed).toBeHidden()

  await context.setOffline(true)
  await context.setOffline(false)
  for (const loaded of [drop, related]) {
    await expect(loaded).toBeVisible()
    await expect.poll(() => loaded.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  }
  await expect.poll(() => asked.get('harness-gone')).toBe(2)
  await expect(gone).toBeHidden()
})

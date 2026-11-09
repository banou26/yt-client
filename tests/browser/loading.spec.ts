import type { Page } from '@playwright/test'

import { expect, test } from './test'

const mountHarness = async (page: Page, path: string, mount: string, ...args: unknown[]) => {
  await page.evaluate(async ({ path, mount, args }) => {
    const harness = await import(path) as Record<string, (...args: unknown[]) => void>
    harness[mount]!(...args)
  }, { path, mount, args })
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

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
    expect(await loaded.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  }
  await expect.poll(() => asked.get('harness-gone')).toBe(2)
  await expect(gone).toBeHidden()
})

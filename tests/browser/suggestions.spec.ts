import type { Page } from '@playwright/test'

import { readFileSync } from 'node:fs'

import { expect, test } from './test'

const HARNESS = '/tests/browser/fixtures/suggestions-harness.tsx'

const recorded = (name: string) => readFileSync(new URL(`../unit/fixtures/${name}`, import.meta.url), 'latin1')
const ANSWERS: Record<string, string> = {
  'taylor s': recorded('suggestions-taylor-s.txt'),
  mrbeas: recorded('suggestions-mrbeas.txt'),
}
const PHOTO_HOSTS = ['encrypted-tbn1.gstatic.com', 'yt3.googleusercontent.com']
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

// upstream's answer to each query the harness's source asks for, in the charset upstream names for `hl=en`
const answerUpstream = async (page: Page) => {
  const asked: string[] = []
  await page.route((url) => url.hostname === 'suggestqueries-clients6.youtube.com', (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? ''
    asked.push(query)
    const body = ANSWERS[query] ?? `window.google.ac.h([${JSON.stringify(query)},[],{"j":"0","k":1}])`
    return route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'text/javascript; charset=ISO-8859-1',
      body: Buffer.from(body, 'latin1'),
    })
  })
  await page.route((url) => PHOTO_HOSTS.includes(url.hostname), (route) => route.fulfill({ contentType: 'image/png', body: PNG }))
  return asked
}

const searched = (page: Page) => expect.poll(() => new URL(page.url()).searchParams.get('search_query'))

test('a suggestion tied to a person or a channel shows its name, what it is and its photo, and searches its query', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  const asked = await answerUpstream(page)
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 90_000 })
  const harness = page.locator('[data-suggestions-harness]')
  const input = harness.getByRole('combobox', { name: 'Search' })
  // the harness's first import can add a dependency for the dev server to bundle, which reloads the page under it
  await expect(async () => {
    if (await harness.count() === 0) {
      await page.evaluate(async (path) => {
        const harness = await import(path) as { mountSuggestions: () => void }
        harness.mountSuggestions()
      }, HARNESS)
    }
    await expect(input).toBeVisible({ timeout: 15_000 })
  }).toPass({ timeout: 90_000 })

  await input.pressSequentially('taylor s', { delay: 30 })
  const list = harness.getByRole('listbox')
  const options = list.getByRole('option')
  const taylor = list.getByRole('option', { name: 'taylor swift', exact: true })
  await expect(options).toHaveCount(4)
  expect(asked).toContain('taylor s')
  await expect(options.first()).toHaveAttribute('aria-label', 'taylor swift')
  await expect(taylor.locator('b')).toHaveText('Taylor Swift')
  const description = taylor.getByText('American singer-songwriter', { exact: true })
  await expect(description).toHaveCSS('font-size', '12px')
  const photo = taylor.locator('img')
  await expect(photo).toHaveAttribute('src', /^https:\/\/encrypted-tbn1\.gstatic\.com\/images\?q=tbn:/)
  await expect(photo).toHaveCSS('border-radius', '4px')
  const [photoBox, listBox] = await Promise.all([photo.boundingBox(), list.boundingBox()])
  expect([photoBox!.width, photoBox!.height]).toEqual([30, 30])
  expect(Math.abs(listBox!.x + listBox!.width - (photoBox!.x + photoBox!.width) - 48)).toBeLessThanOrEqual(1)
  await expect(list.getByRole('option', { name: 'taylor swift songs', exact: true }).locator('b')).toHaveText('wift songs')
  await expect(list.locator('img')).toHaveCount(1)

  await input.press('ArrowDown')
  await expect(input).toHaveValue('taylor swift')
  await expect(taylor).toHaveAttribute('aria-selected', 'true')
  await input.press('Enter')
  await searched(page).toBe('taylor swift')

  await input.fill('')
  await input.pressSequentially('mrbeas', { delay: 30 })
  const channel = list.getByRole('option', { name: 'mrbeast', exact: true })
  await expect(channel.locator('b')).toHaveText('MrBeast')
  await expect(channel.getByText('@MrBeast', { exact: true })).toBeVisible()
  await expect(channel.locator('img')).toHaveCSS('border-radius', '50%')
  await channel.click()
  await searched(page).toBe('mrbeast')
})

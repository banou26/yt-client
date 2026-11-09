import type { Locator, Page } from '@playwright/test'

import { expect, test } from './test'

test.use({ colorScheme: 'light' })

const mountMarks = async (page: Page, options: { unwatchedChip?: boolean } = {}) => {
  await page.goto('/privacy?search_query=never+gonna+give+you+up')
  await page.evaluate(async (options) => {
    const harness = '/tests/browser/fixtures/marks-harness.tsx'
    const { mountMarks } = await import(harness) as { mountMarks: (options: { unwatchedChip?: boolean }) => void }
    mountMarks(options)
  }, options)
  return page.locator('[data-marks-harness]')
}

// where a mark sits in its row, relative to the still or to the text it leads
const offset = (inner: Locator, outer: Locator) => Promise.all([inner.boundingBox(), outer.boundingBox()])
  .then(([a, b]) => ({ left: Math.round(a!.x - b!.x), top: Math.round(a!.y - b!.y) }))

// youtube.com's marks, measured signed out at 1280 px on 2026-11-10: New sits 4px into the still's top-left corner in
// near-black on white, the music note leads the length inside its badge, and a 12px play arrow leads the view count
for (const kind of ['compact', 'grid'] as const) {
  test(`a ${kind} row draws New, the music note and the play arrow its answer names, and nothing on a row without`, async ({ page }) => {
    const rows = (await mountMarks(page)).locator(`[data-marks="${kind}"] article`)
    const [marked, plain] = [rows.nth(0), rows.nth(1)]

    const corner = marked.locator('.thumb [data-mark="corner"]')
    await expect(corner).toHaveText('New')
    expect(await offset(corner, marked.locator('.thumb'))).toEqual({ left: 4, top: 4 })
    await expect(corner).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(corner).toHaveCSS('color', 'rgb(15, 15, 15)')

    const length = marked.locator('.badge')
    await expect(length).toHaveText('3:24')
    await expect(length.locator('[data-mark="music"]')).toBeVisible()
    expect(await length.evaluate(badge => {
      const text = document.createRange()
      text.selectNodeContents([...badge.childNodes].find(node => node.nodeType === Node.TEXT_NODE)!)
      return badge.querySelector('svg')!.getBoundingClientRect().right <= text.getBoundingClientRect().left
    }), 'the note leads the length').toBe(true)

    const meta = marked.locator('.meta')
    await expect(meta).toHaveText('208M • 17y ago')
    const arrow = meta.locator('[data-mark="views"]')
    await expect(arrow).toBeVisible()
    expect(await arrow.boundingBox()).toMatchObject({ width: 12, height: 12 })
    expect(await meta.evaluate(element => element.firstElementChild?.getAttribute('data-mark'))).toBe('views')

    await expect(plain.locator('.badge')).toHaveText('35:24')
    await expect(plain.locator('[data-mark]')).toHaveCount(0)
  })
}

test('a search row prints the words its answer bolds in bold, and the music note on a song\'s length', async ({ page }) => {
  const row = (await mountMarks(page)).locator('[data-marks="search"] article.result')
  const bold = row.locator('.description b')
  await expect(bold).toHaveText('Never Gonna Give You Up')
  await expect(bold).toHaveCSS('font-weight', '500')
  await expect(row.locator('.description')).toHaveText('The official video for Never Gonna Give You Up by Rick Astley.')
  await expect(row.locator('.badge [data-mark="music"]')).toBeVisible()
  await expect(row.locator('.badge')).toHaveText('3:34')
})

// youtube.com shows no chip bar at all on some searches ("election results", measured 2026-11-10)
test('the Unwatched chip shows only on a search whose answer offers it', async ({ page }) => {
  const chips = (await mountMarks(page, { unwatchedChip: false })).locator('[data-marks="search"] .filter-chips button')
  await expect(page.locator('[data-marks="search"] article.result')).toBeVisible()
  await expect(chips).toHaveText(['All', 'Shorts', 'Videos', 'Recently uploaded', 'Live'])

  const offered = (await mountMarks(page)).locator('[data-marks="search"] .filter-chips button')
  await expect(page.locator('[data-marks="search"] article.result')).toBeVisible()
  await expect(offered).toHaveText(['All', 'Shorts', 'Unwatched', 'Videos', 'Recently uploaded', 'Live'])
})

test('the related column and a search draw the marks youtube.com answers with', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/watch?v=dQw4w9WgXcQ')
  const related = page.locator('main aside article')
  await expect(related.first()).toBeVisible({ timeout: 120_000 })
  await expect(related.locator('.meta [data-mark="views"]').first()).toBeVisible()
  await expect(related.locator('.badge [data-mark="music"]').first()).toBeAttached()

  await page.goto('/results?search_query=never+gonna+give+you+up')
  const rows = page.locator('article.result').filter({ has: page.locator('a.thumb') })
  await expect(rows.first()).toBeVisible({ timeout: 120_000 })
  await expect(rows.locator('.description b').first()).toBeVisible()
  await expect(rows.locator('.badge [data-mark="music"]').first()).toBeVisible()
})

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
    await expect(meta).toHaveText('208M 17y ago')
    expect(await meta.evaluate(element => {
      const [views, date] = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map((node) => {
        const text = document.createRange()
        text.selectNodeContents(node)
        return text.getBoundingClientRect()
      })
      return Math.round(date!.left - views!.right)
    }), 'the space the answer sends shows as an 8px gap').toBe(8)
    const arrow = meta.locator('[data-mark="views"]')
    await expect(arrow).toBeVisible()
    expect(await arrow.boundingBox()).toMatchObject({ width: 12, height: 12 })
    expect(await meta.evaluate(element => element.firstElementChild?.getAttribute('data-mark'))).toBe('views')

    await expect(plain.locator('.badge')).toHaveText('35:24')
    await expect(plain.locator('.meta')).toHaveText('3.9M • 14h ago')
    await expect(plain.locator('[data-mark]')).toHaveCount(0)
  })

  // youtube.com's mark, measured signed out at 1280 px on 2026-11-10 on MKBHD's Live tab with Members only applied and
  // on Linus Tech Tips' Videos tab: its own line 2px under the date, a 12px star then 2px then 12px medium text, 18px
  // tall, in #107516 on light and #2ba640 on dark
  test(`a ${kind} row draws Members only on its own line under its date, and a row that is not draws nothing`, async ({ page }) => {
    const rows = (await mountMarks(page)).locator(`[data-marks="${kind}"] article`)
    const members = rows.nth(2)
    const mark = members.locator('.members-only')
    await expect(mark).toHaveText('Members only')
    await expect(members.locator('.meta')).toHaveText('Streamed 4y ago')
    await expect(mark).toHaveCSS('color', 'rgb(16, 117, 22)')
    await expect(mark).toHaveCSS('font-size', '12px')
    await expect(mark).toHaveCSS('font-weight', '500')

    const [date, line, star] = await Promise.all([members.locator('.meta').boundingBox(), mark.boundingBox(), mark.locator('svg').boundingBox()])
    expect({ left: Math.round(line!.x - date!.x), top: Math.round(line!.y - date!.y - date!.height), height: line!.height })
      .toEqual({ left: 0, top: 2, height: 18 })
    expect(star).toMatchObject({ width: 12, height: 12 })
    expect(await mark.evaluate(element => {
      const text = document.createRange()
      text.selectNodeContents([...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE)!)
      return Math.round(text.getBoundingClientRect().left - element.querySelector('svg')!.getBoundingClientRect().right)
    }), 'the text follows the star').toBe(2)

    await expect(rows.nth(0).locator('.members-only')).toHaveCount(0)
    await expect(rows.nth(1).locator('.members-only')).toHaveCount(0)

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(mark).toHaveCSS('color', 'rgb(43, 166, 64)')
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
  await expect(related.locator('.meta').filter({ hasText: '•' })).toHaveCount(0)

  await page.goto('/results?search_query=never+gonna+give+you+up')
  const rows = page.locator('article.result').filter({ has: page.locator('a.thumb') })
  await expect(rows.first()).toBeVisible({ timeout: 120_000 })
  await expect(rows.locator('.description b').first()).toBeVisible()
  await expect(rows.locator('.badge [data-mark="music"]').first()).toBeVisible()
})

// youtube.com's playlist rows and a music channel's Home shelves are lockups too, measured signed out on 2026-11-10:
// the play arrow, the music note and the gap, with no bullet
test('a playlist and a channel\'s Home shelves draw the marks youtube.com answers with', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI')
  const rows = page.locator('main .rows article')
  await expect(rows.first()).toBeVisible({ timeout: 120_000 })
  await expect(rows.locator('.meta [data-mark="views"]').first()).toBeVisible()
  await expect(rows.locator('.badge [data-mark="music"]').first()).toBeAttached()
  await expect(rows.locator('.meta').filter({ hasText: '•' })).toHaveCount(0)

  await page.goto('/@RickAstleyYT')
  const tiles = page.locator('main .shelf-rail article')
  await expect(tiles.first()).toBeVisible({ timeout: 120_000 })
  await expect(tiles.locator('.meta [data-mark="views"]').first()).toBeAttached()
  await expect(tiles.locator('.badge [data-mark="music"]').first()).toBeAttached()
  await expect(tiles.locator('.meta').filter({ hasText: '•' })).toHaveCount(0)
})

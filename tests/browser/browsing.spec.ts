import { expect, test } from '@playwright/test'

test('centres the search box, clears it, and opens the header menu', async ({ page }) => {
  for (const width of [1920, 1600]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/settings')
    const box = await page.getByRole('search').boundingBox()
    expect(box, 'the search form has no box').not.toBeNull()
    expect(Math.abs(box!.x + box!.width / 2 - width / 2), `off centre at ${width}`).toBeLessThanOrEqual(10)
  }

  await expect(page.getByRole('button', { name: 'Search with your voice' })).toHaveCount(0)

  const input = page.getByRole('combobox', { name: 'Search' })
  const clear = page.getByRole('button', { name: 'Clear search query' })
  await expect(clear).toBeHidden()
  await input.fill('lofi')
  await expect(clear).toBeVisible()
  await clear.click()
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await expect(clear).toBeHidden()

  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: /^Appearance/ }).click()
  await page.getByRole('menuitem', { name: 'Light theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('menuitem', { name: 'Dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.keyboard.press('Escape')

  await page.goto('/')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
})

test('bolds the completion in suggestions and keeps the list up while the next one loads', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 90_000 })
  const input = page.getByRole('combobox', { name: 'Search' })
  const list = page.getByRole('listbox')
  await input.pressSequentially('rick a', { delay: 30 })
  await expect(list.getByRole('option').first()).toBeVisible({ timeout: 60_000 })
  await expect(list.getByRole('option').first().locator('b')).not.toHaveText('')
  expect(await list.getByRole('option').first().locator('b').textContent()).not.toMatch(/^rick a/i)

  const before = await list.getByRole('option').allTextContents()
  await page.evaluate(() => {
    const state = { vanished: false }
    Object.assign(window, { suggestState: state })
    new MutationObserver(() => {
      if (!document.getElementById('search-suggestions')) state.vanished = true
    }).observe(document.body, { childList: true, subtree: true })
  })
  await input.press('s')
  await expect.poll(() => list.getByRole('option').allTextContents(), { timeout: 60_000 }).not.toEqual(before)
  const vanished = await page.evaluate(() => (window as unknown as { suggestState: { vanished: boolean } }).suggestState.vanished)
  expect(vanished, 'the list blinked out while the next one loaded').toBe(false)

  await input.fill('')
  await expect(list).toBeHidden()
})

test('search has the chip row, a filters dialog, wide rows and a preview on hover', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/results?search_query=blender')
  const rows = page.locator('article.result').filter({ has: page.locator('a.thumb') })
  await expect(rows.first()).toBeVisible({ timeout: 120_000 })

  const chips = page.locator('.filter-chip')
  await expect(chips).toHaveText(['All', 'Shorts', 'Videos', 'Recently uploaded', 'Live'])
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/About [\d,]+ results/)).toHaveCount(0)

  const thumb = await rows.first().locator('a.thumb').boundingBox()
  expect(thumb!.width, 'the thumbnail is narrower than youtube.com draws it at 1280').toBeGreaterThanOrEqual(480)

  await rows.first().hover()
  await expect(rows.first().locator('video')).toHaveCount(1, { timeout: 30_000 })
  await page.mouse.move(0, 0)

  await page.getByRole('button', { name: /^Filters/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Search filters' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Over 20 minutes' }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/duration=OVER_TWENTY_MINS/)

  await page.getByRole('button', { name: 'Videos', exact: true }).click()
  await expect(page).toHaveURL(/type=VIDEO/)
  await expect(page).toHaveURL(/duration=OVER_TWENTY_MINS/)
  await expect(page.getByRole('button', { name: 'Videos', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('badges verified and artist channels on the watch page, its related column and the channel', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/watch?v=dQw4w9WgXcQ')
  const owner = page.locator('.owner-row')
  await expect(owner.locator('[data-badge="artist"]')).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('article [data-badge]').first()).toBeAttached({ timeout: 60_000 })

  await owner.locator('a.channel-name').click()
  await expect(page.locator('h1 [data-badge="artist"]')).toBeVisible({ timeout: 120_000 })
})

test('puts the home Shorts shelf after the first full row at any width', async ({ page }) => {
  await page.setViewportSize({ width: 2600, height: 900 })
  await page.goto('/settings')
  for (const width of [1200, 1800, 2500]) {
    const layout = await page.evaluate(async (width) => {
      document.querySelector('[data-grid-harness]')?.remove()
      const harness = '/tests/browser/fixtures/grid-harness.tsx'
      const { mountGrid } = await import(harness) as { mountGrid: (width: number) => void }
      mountGrid(width)
      const grid = document.querySelector('[data-grid-harness]')!.firstElementChild!
      const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length
      const shelfTop = grid.querySelector(':scope > section[aria-label="Shorts"]')!.getBoundingClientRect().top
      const above = [...grid.querySelectorAll(':scope > article')]
        .map(card => card.getBoundingClientRect().top)
        .filter(top => top < shelfTop)
      return { columns, above: above.length, rows: new Set(above).size }
    }, width)
    expect(layout.rows, `more than one row before the shelf at ${width}px`).toBe(1)
    expect(layout.above, `the first row is not full at ${width}px`).toBe(layout.columns)
  }
})

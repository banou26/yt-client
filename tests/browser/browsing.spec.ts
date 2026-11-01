import { expect, test } from '@playwright/test'

test('centres the search box, clears it, and opens the header menu', async ({ page }) => {
  for (const width of [1920, 1600, 1440, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/settings')
    // the extension offer is the widest thing at the header's end, and it lands a second after the page
    await expect(page.getByRole('button', { name: 'Faster with the extension' })).toBeVisible({ timeout: 30_000 })
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
  const [listBox, searchBox] = await Promise.all([list.boundingBox(), page.locator('.search-box').boundingBox()])
  expect(Math.abs(listBox!.x - searchBox!.x), 'the list does not line up with the box').toBeLessThanOrEqual(1)
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
  await expect(page.locator('h1'), 'the badge adds its label to the name').toHaveText('Rick Astley')
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

test('plays Shorts signed out, with the comment count, the pager and the ⋮ menu', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/shorts')
  const slide = page.locator('[data-short-id]').first()
  await expect(slide).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('Sign in to see Shorts')).toHaveCount(0)
  await expect(page).toHaveURL(/\/shorts\/[\w-]{11}$/)
  const first = new URL(page.url()).pathname

  await expect(slide.getByRole('button', { name: 'Comments' })).toHaveText(/\d/, { timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Previous short' })).toBeHidden()

  const next = page.getByRole('button', { name: 'Next short' })
  const panel = page.locator('.comments-panel')
  await slide.getByRole('button', { name: 'Comments' }).click()
  await expect(panel).toBeVisible()
  // 1320 is the expanded guide's first width, where a tall viewport pushes the panel furthest right
  for (const width of [1000, 1320]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(async () => {
      if (!await next.isVisible()) return false
      const [button, comments] = await Promise.all([next.boundingBox(), panel.boundingBox()])
      return button!.x < comments!.x + comments!.width
    }, { message: `the pager covers the comments at ${width}px` }).toBe(false)
  }
  await page.getByRole('button', { name: 'Close comments' }).click()
  await expect(next).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })

  await slide.getByRole('button', { name: 'More actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Open in the full player' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Next short' }).click()
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).not.toBe(first)
  await expect(page.getByRole('button', { name: 'Previous short' })).toBeVisible()
})

test('has a You page and Explore entries that lead to videos', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/feed/you')
  const main = page.locator('main')
  await expect(main.getByRole('heading', { name: 'Enjoy your favorite videos' })).toBeVisible({ timeout: 90_000 })
  await expect(main.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText('Not found')).toHaveCount(0)

  const guide = page.getByRole('navigation', { name: 'Guide' })
  await expect(guide.getByRole('link', { name: 'You', exact: true })).toHaveAttribute('href', '/feed/you')
  await expect(guide.getByRole('link', { name: 'You', exact: true })).toHaveAttribute('aria-current', 'page')
  const homeLinks = await guide.locator('a[href="/"]').count()
  expect(homeLinks, 'an Explore entry still points at Home').toBe(1)

  // back on the You page between entries, so a row still up from the previous search cannot pass for the next one
  const rows = main.locator('article.result').filter({ has: page.locator('a.thumb') })
  for (const label of ['Music', 'Live', 'Gaming']) {
    await guide.getByRole('link', { name: 'You', exact: true }).click()
    await expect(rows).toHaveCount(0)
    await guide.getByRole('link', { name: label, exact: true }).click()
    await expect(rows.first(), `the ${label} entry leads to no videos`).toBeVisible({ timeout: 120_000 })
  }

  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.getByRole('navigation', { name: 'Guide' }).getByRole('link', { name: 'You' })).toHaveAttribute('href', '/feed/you')
})

test('leaves an empty Watch later shelf off the signed-in You page', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 90_000 })
  await page.evaluate(async () => {
    const harness = '/tests/browser/fixtures/you-harness.tsx'
    const { mountYou } = await import(harness) as { mountYou: () => void }
    mountYou()
  })
  const you = page.locator('[data-you-harness]')
  await expect(you.getByRole('region', { name: 'Liked videos' }).locator('article')).toHaveCount(1)
  await expect(you.getByRole('region', { name: 'History' })).toBeVisible()
  await expect(you.getByRole('region', { name: 'Watch later' })).toHaveCount(0)
})

import { expect, test } from './test'

test.use({ colorScheme: 'light' })

// youtube.com's bar has a Shorts chip on the first search and none on the second, measured signed out on 2026-11-10
for (const query of ['never gonna give you up', 'python tutorial']) {
  test(`the Unwatched chip lists what upstream's own chip brings for "${query}"`, async ({ page }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/results?${new URLSearchParams({ search_query: query })}`)
    const rows = page.locator('article.result').filter({ has: page.locator('a.thumb') })
    await expect(rows.first()).toBeVisible({ timeout: 120_000 })
    const unwatched = page.getByRole('button', { name: 'Unwatched', exact: true })
    await expect(unwatched).toHaveAttribute('aria-pressed', 'false')
    await unwatched.click()
    await expect(page).toHaveURL(/[?&]unwatched=1/)
    await expect(unwatched).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(rows.first()).toBeVisible({ timeout: 120_000 })
    await expect(page.locator('main .status')).toHaveCount(0)
  })
}

test('the Live tab sorts from its Latest dropdown and filters by Members only and Public', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/@mkbhd/streams')
  const bar = page.locator('main .sorts')
  const titles = page.locator('main .videos article h3')
  await expect(titles.first()).toBeVisible({ timeout: 120_000 })
  const sort = bar.getByRole('button', { name: 'Latest' })
  await expect(sort).toHaveAttribute('aria-haspopup', 'menu')
  await expect(bar.getByRole('button')).toHaveText(['Latest', 'Members only', 'Public'])
  const members = bar.getByRole('button', { name: 'Members only', exact: true })
  await expect(members).toHaveAttribute('aria-pressed', 'false')
  // the first few titles, so a false failure needs both lists to open with the same streams
  const opening = async () => (await titles.allTextContents()).slice(0, 6)
  const everyone = await opening()

  await members.click()
  await expect(page).toHaveURL(/[?&]filter=Members\+only/)
  await expect(members).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => {
    const now = await opening()
    return now.length > 0 && now.join('\n') !== everyone.join('\n')
  }, { timeout: 120_000 }).toBe(true)
  await expect(page.locator('main .videos article').filter({ hasNot: page.locator('.members-only') })).toHaveCount(0)

  await sort.click()
  const menu = page.getByRole('menu', { name: 'Sort by' })
  await expect(menu.getByRole('menuitem')).toHaveText(['Latest', 'Popular', 'Oldest'])
  await menu.getByRole('menuitem', { name: 'Popular' }).click()
  await expect(page).toHaveURL(/[?&]sort=Popular/)
  await expect(page).toHaveURL(/[?&]filter=Members\+only/)
  await expect(bar.getByRole('button', { name: 'Popular' })).toBeVisible({ timeout: 120_000 })

  await members.click()
  await expect(page).not.toHaveURL(/filter=/)
  await expect(members).toHaveAttribute('aria-pressed', 'false')
})

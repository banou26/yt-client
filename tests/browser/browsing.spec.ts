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

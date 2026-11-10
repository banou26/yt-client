import type { Page } from '@playwright/test'

import { expect, test } from './test'

test.use({ colorScheme: 'light' })

const filtersDialog = async (page: Page) => {
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Search filters' })
  await expect(dialog).toBeVisible()
  return dialog
}

// measured on youtube.com signed out, 2026-11-10
test('the Filters panel has youtube.com\'s groups and labels, Relevance held until Popularity is picked', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/results?search_query=lofi')
  const dialog = await filtersDialog(page)
  await expect(dialog.locator('.group-title')).toHaveText(['Type', 'Duration', 'Upload date', 'Features', 'Prioritize'])
  await expect(dialog.locator('.filters > div').first().getByRole('button')).toHaveText(['Videos', 'Shorts', 'Channels', 'Playlists', 'Movies'])
  await expect(dialog.locator('.filters > div').nth(1).getByRole('button')).toHaveText(['Under 3 minutes', '3 - 20 minutes', 'Over 20 minutes'])
  await expect(dialog.getByRole('button', { name: 'Subtitles/CC' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '360°' })).toBeVisible()
  const relevance = dialog.getByRole('button', { name: 'Relevance' })
  await expect(relevance).toHaveAttribute('aria-pressed', 'true')
  await relevance.click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Popularity' }).click()
  await expect(page).toHaveURL(/[?&]sort=POPULARITY/)

  await filtersDialog(page)
  await expect(dialog.getByRole('button', { name: 'Popularity' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Relevance' })).toHaveAttribute('aria-pressed', 'false')
  await dialog.getByRole('button', { name: 'Relevance' }).click()
  await expect(page).not.toHaveURL(/sort=/)
})

test('a youtube.com filter link keeps its filter, and the next pick writes it readable', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  // youtube.com's own Playlists link, as its address bar spells it
  await page.goto('/results?search_query=lofi&sp=EgIQAw%253D%253D')
  await expect(page.locator('main .results a.playlist-thumb').first()).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('main .results > :not(.result-placeholder)').filter({ hasNot: page.locator('a.playlist-thumb') })).toHaveCount(0)
  const dialog = await filtersDialog(page)
  await expect(dialog.getByRole('button', { name: 'Playlists' })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Popularity' }).click()
  await expect(page).toHaveURL(/[?&]type=PLAYLIST/)
  await expect(page).toHaveURL(/[?&]sort=POPULARITY/)
  await expect(page).not.toHaveURL(/[?&]sp=/)
})

test('an unknown or wrongly cased filter value is ignored rather than shown as an error', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/results?search_query=lofi+playlist&type=playlist&features=hd')
  await expect(page.locator('main .results a[href]').first()).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('main .status')).toHaveCount(0)
  const dialog = await filtersDialog(page)
  await expect(dialog.locator('.option[aria-pressed="true"]')).toHaveText(['Relevance'])
})

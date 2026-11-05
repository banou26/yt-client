import { expect, test } from '@playwright/test'

/* This client keeps a channel's tab in the query string, so every path form
   upstream uses has to bounce to that canonical shape. */

const CHANNEL_ID = 'UCSMOQeBJ2RAnuFungnQOxLg'

test('bounces the tab paths a channel page links to', async ({ page }) => {
  for (const [path, expected] of [
    ['/@Blender/videos', '/@Blender?tab=VIDEOS'],
    ['/@Blender/shorts', '/@Blender?tab=SHORTS'],
    // Upstream calls the live tab `streams`, and the enum calls it LIVE.
    ['/@Blender/streams', '/@Blender?tab=LIVE'],
    ['/@Blender/playlists', '/@Blender?tab=PLAYLISTS'],
    ['/@Blender/community', '/@Blender?tab=COMMUNITY'],
    // youtube.com's own word for the tab now
    ['/@Blender/posts', '/@Blender?tab=COMMUNITY'],
    ['/@Blender/about', '/@Blender?tab=ABOUT'],
    ['/@Blender/featured', '/@Blender'],
    [`/channel/${CHANNEL_ID}/videos`, `/channel/${CHANNEL_ID}?tab=VIDEOS`],
  ] as const) {
    await page.goto(path)
    await expect(page, `${path} should land on ${expected}`).toHaveURL(expected)
  }
})

test('replaces the tab path rather than stacking it in history', async ({ page }) => {
  await page.goto('/settings')
  await page.goto('/@Blender/videos')
  await expect(page).toHaveURL('/@Blender?tab=VIDEOS')
  await page.goBack()
  await expect(page).toHaveURL('/settings')
})

test('refuses a segment that is not a tab', async ({ page }) => {
  await page.goto('/@Blender/nonsense')
  await expect(page.getByText('Not found')).toBeVisible()
  await expect(page).toHaveURL('/@Blender/nonsense')

  await page.goto('/nonsense/videos')
  await expect(page.getByText('Not found')).toBeVisible()
})

test('lands a channel handle on its Home tab, with the featured video and the shelves', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/@RickAstleyYT')
  const tabs = page.getByRole('navigation', { name: 'Channel sections' })
  await expect(tabs.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page', { timeout: 120_000 })
  await expect(page).toHaveURL('/@RickAstleyYT')
  const featured = page.getByRole('region', { name: 'Featured video' })
  await expect(featured.getByRole('link', { name: /\S/ })).toHaveAttribute('href', /^\/watch\?v=/)
  const shelves = page.locator('main section[aria-label]:not([aria-label="Featured video"])')
    .filter({ has: page.locator('a[href^="/watch?v="], a[href^="/shorts/"]') })
  expect(await shelves.count()).toBeGreaterThanOrEqual(2)
  await expect(shelves.first().locator('h2')).not.toBeEmpty()
})

test('names the tabs like youtube.com, sorts Videos by chips and searches from an icon', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/@RickAstleyYT?tab=VIDEOS')
  const tabs = page.getByRole('navigation', { name: 'Channel sections' })
  await expect(tabs.getByRole('button', { name: 'Videos', exact: true })).toHaveAttribute('aria-current', 'page', { timeout: 120_000 })
  await expect(tabs.getByRole('button', { name: 'Posts', exact: true })).toBeVisible()
  await expect(tabs.getByText('Community')).toHaveCount(0)

  await expect(page.getByRole('button', { name: 'Latest', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Popular', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Oldest', exact: true }).click()
  await expect(page).toHaveURL(/sort=Oldest/)
  await expect(page.getByRole('button', { name: 'Oldest', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('main article a.thumb').first()).toHaveAttribute('href', '/watch?v=dQw4w9WgXcQ', { timeout: 120_000 })

  await tabs.getByRole('button', { name: 'Search', exact: true }).click()
  const box = tabs.getByRole('searchbox', { name: 'Search this channel' })
  await expect(box).toBeFocused()
  await page.keyboard.type('never gonna')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/tab=SEARCH&query=never\+gonna/)
  await expect(box).toHaveValue('never gonna')
  await expect(page.locator('main article a[href^="/watch?v="]').first()).toBeVisible({ timeout: 120_000 })
})

test('keeps the channel\'s name in its header once its own videos fill the Home shelves', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/@LinusTechTips')
  const shelf = page.getByRole('region', { name: 'Videos', exact: true })
  await expect(shelf.locator('a[href^="/watch?v="]').first()).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('main h1')).toHaveText('Linus Tech Tips')
  await expect(shelf.locator('.channel-name')).toHaveCount(0)
})

test('fits a channel\'s Home shelves in a phone\'s width', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/@RickAstleyYT')
  await expect(page.locator('main .arrow.right').first()).toBeVisible({ timeout: 120_000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
})

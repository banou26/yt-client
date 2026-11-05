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

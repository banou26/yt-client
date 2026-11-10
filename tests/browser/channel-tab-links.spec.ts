import { expect, test } from './test'

/* youtube.com's channel addresses, measured signed out on 2026-11-10: a tab opens at /@handle/<word> (Home at
   /featured, Live at /streams, Posts at /posts, a search at /search?query=), under the channel's handle even from its
   /channel/, /c/ or /user/ address, and every one of those addresses opens in place. */

const MKBHD_ID = 'UCBJycsmduvYEL83R_U4JriQ'

test('links each tab to youtube.com\'s address for it, so a middle-click opens the tab in a new page', async ({ page, context }) => {
  test.setTimeout(240_000)
  await page.goto(`/channel/${MKBHD_ID}`)
  const tabs = page.getByRole('navigation', { name: 'Channel sections' })
  await expect(tabs.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page', { timeout: 120_000 })
  const links = await tabs.getByRole('link').evaluateAll(anchors => anchors.map(anchor => [anchor.textContent, anchor.getAttribute('href')]))
  expect(links).toEqual([
    ['Home', '/@mkbhd/featured'],
    ['Videos', '/@mkbhd/videos'],
    ['Shorts', '/@mkbhd/shorts'],
    ['Live', '/@mkbhd/streams'],
    ['Shows', '/@mkbhd/shows'],
    ['Playlists', '/@mkbhd/playlists'],
    ['Posts', '/@mkbhd/posts'],
  ])

  const opened = context.waitForEvent('page')
  await tabs.getByRole('link', { name: 'Videos', exact: true }).click({ button: 'middle' })
  const other = await opened
  await expect(other).toHaveURL('/@mkbhd/videos')
  await other.close()
  await expect(page).toHaveURL(`/channel/${MKBHD_ID}`)

  await tabs.getByRole('link', { name: 'Videos', exact: true }).click()
  await expect(page).toHaveURL('/@mkbhd/videos')
  await expect(tabs.getByRole('link', { name: 'Videos', exact: true })).toHaveAttribute('aria-current', 'page', { timeout: 120_000 })
  await expect(page.locator('main article a[href^="/watch?v="]').first()).toBeVisible({ timeout: 120_000 })
})

test('opens youtube.com\'s tab addresses in place, and moves the old ?tab= addresses to them', async ({ page }) => {
  for (const path of ['/@Blender/videos', '/@Blender/streams', '/@Blender/featured', '/@Blender/about', `/channel/${MKBHD_ID}/videos`, '/c/mkbhd/shorts']) {
    await page.goto(path)
    await expect(page, `${path} should stay`).toHaveURL(path)
  }
  for (const [path, expected] of [
    ['/@Blender?tab=VIDEOS', '/@Blender/videos'],
    ['/@Blender?tab=LIVE', '/@Blender/streams'],
    ['/@Blender?tab=COMMUNITY', '/@Blender/posts'],
    ['/@Blender?tab=ABOUT', '/@Blender/about'],
    ['/@Blender?tab=HOME', '/@Blender/featured'],
    ['/@Blender?tab=VIDEOS&sort=Popular', '/@Blender/videos?sort=Popular'],
    ['/@Blender?tab=SEARCH&query=donut', '/@Blender/search?query=donut'],
    // youtube.com's old word for Posts
    ['/@Blender/community', '/@Blender/posts'],
    [`/channel/${MKBHD_ID}?tab=VIDEOS`, `/channel/${MKBHD_ID}/videos`],
    ['/user/marquesbrownlee?tab=PLAYLISTS', '/user/marquesbrownlee/playlists'],
  ] as const) {
    await page.goto(path)
    await expect(page, `${path} should land on ${expected}`).toHaveURL(expected)
  }
})

test('replaces an old ?tab= address rather than stacking it in history', async ({ page }) => {
  await page.goto('/settings')
  await page.goto('/@Blender?tab=VIDEOS')
  await expect(page).toHaveURL('/@Blender/videos')
  await page.goBack()
  await expect(page).toHaveURL('/settings')
})

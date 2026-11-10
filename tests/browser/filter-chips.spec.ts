import type { Page } from '@playwright/test'

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

/* youtube.com's Live tab, signed out (measured 2026-11-11): a channel with members-only streams has a Latest dropdown
   (Latest, Popular, Oldest) followed by the Members only and Public chips (@HoushouMarine, @usadapekora), and one without
   has the Latest, Popular and Oldest chips (@mkbhd, which had members-only streams on 2026-11-10 and has neither them nor
   a Join button since). So both run on recorded answers: channel-live-mkbhd.json (2026-11-10, the same shape as today's
   dropdown once its tracking fields are dropped) and channel-live-chips-mkbhd.json (2026-11-11). */

const HARNESS = '/tests/browser/fixtures/channel-harness.tsx'

const mountLive = async (page: Page, mount: 'mountChannelLiveDropdown' | 'mountChannelLiveChips') => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 90_000 })
  const live = page.locator('[data-channel-live-harness]')
  // the harness's first import can add a dependency for the dev server to bundle, which reloads the page under it
  await expect(async () => {
    if (await live.count() === 0) {
      await page.evaluate(async ({ path, mount }) => {
        const harness = await import(path) as Record<string, () => void>
        harness[mount]!()
      }, { path: HARNESS, mount })
    }
    await expect(live.locator('.videos article h3').first()).toBeVisible({ timeout: 15_000 })
  }).toPass({ timeout: 120_000 })
  return { bar: live.locator('.sorts'), titles: live.locator('.videos article h3'), rows: live.locator('.videos article') }
}

test('the Live tab of a channel with members-only streams sorts from its Latest dropdown and filters by Members only', async ({ page }) => {
  test.setTimeout(180_000)
  const { bar, titles, rows } = await mountLive(page, 'mountChannelLiveDropdown')
  const sort = bar.getByRole('button', { name: 'Latest' })
  await expect(sort).toHaveAttribute('aria-haspopup', 'menu')
  await expect(bar.getByRole('button')).toHaveText(['Latest', 'Members only', 'Public'])
  await expect(titles).toHaveText(['5 New Phone Updates + Giveaway Update!', 'Spooky LIVE Q&A'])
  const members = bar.getByRole('button', { name: 'Members only', exact: true })
  await expect(members).toHaveAttribute('aria-pressed', 'false')

  await members.click()
  await expect(page).toHaveURL(/[?&]filter=Members\+only/)
  await expect(members).toHaveAttribute('aria-pressed', 'true')
  await expect(titles).toHaveText(['May the 4th Be With You!', 'Members Only April Fitness Challenge!'])
  await expect(rows.filter({ hasNot: page.locator('.members-only') })).toHaveCount(0)

  await sort.click()
  const menu = page.getByRole('menu', { name: 'Sort by' })
  await expect(menu.getByRole('menuitem')).toHaveText(['Latest', 'Popular', 'Oldest'])
  await menu.getByRole('menuitem', { name: 'Popular' }).click()
  await expect(page).toHaveURL(/[?&]sort=Popular/)
  await expect(page).toHaveURL(/[?&]filter=Members\+only/)
  await expect(bar.getByRole('button', { name: 'Popular' })).toHaveAttribute('aria-haspopup', 'menu')
  await expect(titles).toHaveText(['May the 4th Be With You!', 'Is This Thing On?'])

  await members.click()
  await expect(page).not.toHaveURL(/filter=/)
  await expect(members).toHaveAttribute('aria-pressed', 'false')
  await expect(titles).toHaveText(['LG 77" Wallpaper TV Unboxing [LIVE]', 'The Road to 5,000,000! [LIVE]'])
})

test('the Live tab of a channel with no members-only streams sorts by its Latest, Popular and Oldest chips', async ({ page }) => {
  test.setTimeout(180_000)
  const { bar, titles } = await mountLive(page, 'mountChannelLiveChips')
  await expect(bar.getByRole('button')).toHaveText(['Latest', 'Popular', 'Oldest'])
  await expect(bar.locator('[aria-haspopup]')).toHaveCount(0)
  const latest = bar.getByRole('button', { name: 'Latest', exact: true })
  const popular = bar.getByRole('button', { name: 'Popular', exact: true })
  await expect(latest).toHaveAttribute('aria-pressed', 'true')
  await expect(popular).toHaveAttribute('aria-pressed', 'false')
  await expect(titles).toHaveText(['5 New Phone Updates + Giveaway Update!', 'Spooky LIVE Q&A'])

  await popular.click()
  await expect(page).toHaveURL(/[?&]sort=Popular/)
  await expect(popular).toHaveAttribute('aria-pressed', 'true')
  await expect(latest).toHaveAttribute('aria-pressed', 'false')
  await expect(titles).toHaveText(['LG 77" Wallpaper TV Unboxing [LIVE]', 'The Road to 5,000,000! [LIVE]'])
})

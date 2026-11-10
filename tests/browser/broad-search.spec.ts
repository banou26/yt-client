import type { Locator, Page } from '@playwright/test'

import { expect, test } from './test'

// the scheduled video's date is printed in the viewer's zone, as youtube.com printed it in Tokyo
test.use({ colorScheme: 'light', timezoneId: 'Asia/Tokyo' })

const mountSearch = async (page: Page, width: number) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/privacy?search_query=minecraft')
  await page.evaluate(async () => {
    const harness = '/tests/browser/fixtures/search-harness.tsx'
    const { mountSearch } = await import(harness) as { mountSearch: () => void }
    mountSearch()
  })
  return page.locator('[data-search-harness]')
}

const left = async (locator: Locator) => Math.round((await locator.boundingBox())!.x)

// youtube.com's carousel, measured signed out searching "minecraft" on 2026-11-10: cards 360px wide on a 364px step, an
// arrow moves the row by as many cards as its width holds rounded (two at 1280px, one at 412px, and two for the one and
// a half a 600px row holds), Previous shows once the row has moved and More goes at its end
for (const [width, shown] of [[1280, 2], [632, 2], [412, 1]] as const) {
  test(`a broad search's "People also search for" carousel steps ${shown} card${shown > 1 ? 's' : ''} at ${width}px`, async ({ page }) => {
    const search = await mountSearch(page, width)
    const carousel = search.getByRole('region', { name: 'Minecraft Addon', exact: true })
    await expect(carousel.getByRole('heading', { name: 'Minecraft Addon', exact: true })).toBeVisible({ timeout: 60_000 })
    await expect(carousel.getByText('People also search for', { exact: true })).toBeVisible()
    await expect(search.locator('.columns > .results > *').nth(1)).toHaveAttribute('aria-label', 'Minecraft Addon')

    const cards = carousel.locator('article')
    await expect(cards).toHaveCount(6)
    const [first, second] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()])
    expect(first!.width).toBe(360)
    expect(second!.x - first!.x).toBe(364)
    await expect(cards.nth(0).getByRole('link', { name: 'ECKOSOLDIER', exact: true })).toBeVisible()
    await expect(cards.nth(0).getByText('95K • 2w ago', { exact: true })).toBeVisible()

    const previous = carousel.getByRole('button', { name: 'Previous Minecraft Addon', exact: true })
    const more = carousel.getByRole('button', { name: 'More Minecraft Addon', exact: true })
    await expect(previous).toHaveCount(0)
    const start = await left(cards.nth(0))
    await more.click()
    await expect.poll(() => left(cards.nth(shown))).toBe(start)
    await expect(previous).toBeVisible()

    await previous.click()
    await expect.poll(() => left(cards.nth(0))).toBe(start)
    await expect(previous).toHaveCount(0)
    await carousel.locator('.track').evaluate(track => track.scrollTo({ left: track.scrollWidth, behavior: 'instant' }))
    await expect(more).toHaveCount(0)
    await expect(previous).toBeVisible()
  })
}

// youtube.com's More arrow hangs 16px past the carousel (measured from 800 to 1600px), which keeps it inside the page's
// 16px gutter where a 20px overhang scrolled the page sideways by 4px
test('a broad search\'s carousel keeps its More arrow inside the gutter', async ({ page }) => {
  const search = await mountSearch(page, 1000)
  const carousel = search.getByRole('region', { name: 'Minecraft Addon', exact: true })
  const more = carousel.getByRole('button', { name: 'More Minecraft Addon', exact: true })
  await expect(more).toBeVisible({ timeout: 60_000 })
  const [row, arrow] = await Promise.all([carousel.locator('.track').boundingBox(), more.boundingBox()])
  expect(Math.round(arrow!.x + arrow!.width - row!.x - row!.width)).toBe(16)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1000)
})

// youtube.com's right column, measured the same way: a 385px card 40px beside the results, its head opening the topic's
// channel, the newest video large, then the list; the two columns together are 1280px at most, and the column is dropped
// below 1091px rather than moved into the results
test('a broad search shows the topic card in a right column, dropped below 1091px', async ({ page }) => {
  const search = await mountSearch(page, 1280)
  const topic = search.getByRole('complementary', { name: 'Minecraft', exact: true })
  await expect(topic).toBeVisible({ timeout: 60_000 })
  const [results, card, row] = await Promise.all([
    search.locator('.columns > .results').boundingBox(),
    topic.boundingBox(),
    search.locator('.columns > .results > *').first().boundingBox(),
  ])
  expect(card!.width).toBe(385)
  expect(Math.round(card!.x - results!.x - results!.width)).toBe(40)
  expect(Math.round(card!.y)).toBe(Math.round(row!.y))

  await expect(topic.getByRole('link', { name: 'Minecraft Video game • Released: 2009', exact: true }))
    .toHaveAttribute('href', '/channel/UCQvWX73GQygcwXOTSf_VDVg')
  await expect(topic.getByRole('heading', { name: 'Minecraft', exact: true })).toHaveCSS('font-size', '18px')
  await expect(topic.getByRole('link', { name: 'Introducing Minecraft Realms Pro Minecraft • 170K • 11h ago', exact: true }))
    .toHaveAttribute('href', '/watch?v=8JGY7vGkMX0')

  const scheduled = topic.getByRole('article').filter({ has: page.getByRole('link', { name: 'The POW Show: Challenges & Trivia', exact: true }) })
  await expect(scheduled.getByRole('link', { name: 'The POW Show: Challenges & Trivia', exact: true })).toHaveAttribute('href', '/watch?v=FA_rn1PKtZY')
  await expect(scheduled.getByRole('link', { name: 'Minecraft', exact: true })).toHaveAttribute('href', '/channel/UC1sELGmy5jp5fQUugmuYlXQ')
  await expect(scheduled.getByText('Scheduled for 11/16/26, 9:00 AM', { exact: true })).toBeVisible()
  const out = topic.getByRole('article').filter({ has: page.getByRole('link', { name: 'Minecraft Dungeons II: Surprise Showcase', exact: true }) })
  await expect(out.getByText('301K • 3d ago', { exact: true })).toBeVisible()
  await expect(out.getByText('0:28', { exact: true })).toBeVisible()
  expect(await out.locator('a[aria-hidden="true"]').boundingBox()).toMatchObject({ width: 120, height: 68 })
  await expect(topic.getByRole('link', { name: 'View all', exact: true })).toHaveAttribute('href', '/channel/UCQvWX73GQygcwXOTSf_VDVg')

  await page.setViewportSize({ width: 1920, height: 900 })
  await expect.poll(async () => (await search.locator('.columns > .results').boundingBox())!.width).toBe(855)

  await page.setViewportSize({ width: 1091, height: 900 })
  await expect(topic).toBeVisible()
  await page.setViewportSize({ width: 1090, height: 900 })
  await expect(topic).toBeHidden()
  await page.setViewportSize({ width: 412, height: 900 })
  await expect(topic).toBeHidden()
})

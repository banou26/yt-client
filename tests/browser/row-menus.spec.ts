import type { Locator } from '@playwright/test'

import { expect, test } from './test'

test.use({ colorScheme: 'light' })

const ITEMS = ['Save to Watch later', 'Save to playlist', 'Share']

const scrollOf = (track: Locator) => track.evaluate(element => [element.scrollTop, element.scrollLeft])

// toBeInViewport sees a row's clip; the hit test also sees a later card painted over the menu
const expectWhole = async (menu: Locator) => {
  for (const name of ITEMS) {
    const item = menu.getByRole('menuitem', { name })
    await expect(item).toBeInViewport({ ratio: 1 })
    const hit = await item.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
    })
    expect(hit, `"${name}" is covered`).toBe(true)
  }
}

// youtube.com leaves 8px between the button and the menu, below it or above it, and lines up one of their edges
const anchored = async (menu: Locator, button: Locator) => {
  const [panel, trigger] = await Promise.all([menu.boundingBox(), button.boundingBox()])
  if (!panel || !trigger) return false
  const near = (a: number, b: number) => Math.abs(a - b) <= 1
  return (near(panel.y, trigger.y + trigger.height + 8) || near(panel.y + panel.height, trigger.y - 8))
    && (near(panel.x, trigger.x) || near(panel.x + panel.width, trigger.x + trigger.width))
}

test('a menu in the artist card opens whole, in the page colours, and follows its button', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/results?search_query=rick+astley')
  const card = page.getByRole('region', { name: 'Rick Astley', exact: true })
  const tile = card.locator('article').first()
  await expect(tile).toBeVisible({ timeout: 120_000 })
  const track = card.locator('.track')
  const before = await scrollOf(track)

  const more = tile.getByRole('button', { name: /^More actions for / })
  await more.click()
  const menu = page.getByRole('menu', { name: /^More actions for / })
  await expectWhole(menu)
  expect(await scrollOf(track), 'the row scrolled').toEqual(before)
  expect(await anchored(menu, more)).toBe(true)
  // with room on its right, youtube.com opens a card's menu rightwards from the button
  const [panel, trigger] = await Promise.all([menu.boundingBox(), more.boundingBox()])
  expect(Math.abs(panel!.x - trigger!.x)).toBeLessThanOrEqual(1)

  // youtube.com draws this menu in the page's theme, not in the card's dark one
  await expect(menu).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(menu.getByRole('menuitem', { name: 'Share' })).toHaveCSS('color', 'rgb(15, 15, 15)')

  await page.evaluate(() => scrollBy(0, 60))
  await expect.poll(() => anchored(menu, more), { message: 'the menu stayed put while the page scrolled' }).toBe(true)
  await page.setViewportSize({ width: 1100, height: 900 })
  await expect.poll(() => anchored(menu, more), { message: 'the menu stayed put while the window narrowed' }).toBe(true)
  await expectWhole(menu)
})

test('a menu in a channel Home row opens whole and keeps its keyboard', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/@RickAstleyYT')
  const row = page.locator('main section[aria-label]').filter({ has: page.locator('.shelf-rail article') }).first()
  const tile = row.locator('article').first()
  await expect(tile).toBeVisible({ timeout: 120_000 })
  await tile.scrollIntoViewIfNeeded()
  const track = row.locator('.track')
  const before = await scrollOf(track)

  const more = tile.getByRole('button', { name: /^More actions for / })
  await more.click()
  const menu = page.getByRole('menu', { name: /^More actions for / })
  await expectWhole(menu)
  expect(await scrollOf(track), 'the row scrolled').toEqual(before)
  expect(await anchored(menu, more)).toBe(true)

  await expect(menu.getByRole('menuitem', { name: 'Save to Watch later' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Save to playlist' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(more).toBeFocused()

  await more.click()
  await page.locator('main h1').click()
  await expect(menu).toBeHidden()

  await more.click()
  await menu.getByRole('menuitem', { name: 'Share' }).click()
  await expect(menu).toBeHidden()
  await expect(page.getByText(/^(Link copied to clipboard|Could not copy the link)$/)).toBeVisible()
})

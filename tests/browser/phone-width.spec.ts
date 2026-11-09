import type { Locator } from '@playwright/test'

import { expect, test } from './test'

test('searches from the header\'s search icon at a phone\'s width', async ({ page }) => {
  test.setTimeout(180_000)
  const input = page.getByRole('combobox', { name: 'Search' })
  const home = page.getByRole('link', { name: 'yt-client home' })
  const searchButton = page.getByRole('button', { name: 'Search', exact: true })

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await expect(input).toBeVisible()
  await expect(searchButton).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)

  await page.setViewportSize({ width: 412, height: 860 })
  await expect(home).toBeVisible()
  // the header is final once the session is known: before that it also holds the notifications bell
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 90_000 })
  await expect(page.getByRole('button', { name: 'Notifications' })).toHaveCount(0, { timeout: 30_000 })
  for (const width of [360, 412]) {
    await page.setViewportSize({ width, height: 860 })
    const signIn = (await page.getByRole('button', { name: 'Sign in' }).boundingBox())!
    expect(signIn.x + signIn.width, `Sign in runs off the header at ${width}`).toBeLessThanOrEqual(width)
  }

  // polled because FKN's bar takes the clicks over the header for a few seconds after load
  await expect.poll(() => searchButton.evaluate(button => {
    const box = button.getBoundingClientRect()
    return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
  }), { message: 'the header\'s search button is covered or off screen', timeout: 20_000 }).toBe(true)
  await searchButton.click()
  await expect(home).toBeHidden()
  await expect(input).toBeFocused()
  expect((await page.getByRole('search').boundingBox())!.width).toBeGreaterThan(300)
  await input.fill('rick astley')
  await input.press('Enter')
  await expect(page).toHaveURL(/\/results\?search_query=rick%20astley$/)
  await expect(input).toHaveValue('rick astley')

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(input).toBeHidden()
  await expect(home).toBeVisible()

  await searchButton.click()
  await expect(home).toBeHidden()
  await page.setViewportSize({ width: 1280, height: 900 })
  // media query listeners run with the next frame
  await page.evaluate(() => new Promise(requestAnimationFrame))
  await page.setViewportSize({ width: 412, height: 860 })
  await expect(home, 'the search bar stays open after the window was wide').toBeVisible()
})

const rightEdges = (link: Locator) => link.evaluate(element => ({
  badge: element.querySelector('[data-badge]')!.getBoundingClientRect().right,
  link: element.getBoundingClientRect().right,
  column: element.parentElement!.getBoundingClientRect().right,
}))

test('fits the watch page in a phone\'s width', async ({ page }) => {
  test.setTimeout(240_000)
  // a real count as production shows one: the shared fixture's zero shows none, and so hides the width it takes
  await page.route('https://returnyoutubedislikeapi.com/**', route =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { likes: 19496469, dislikes: 521680 } }))
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/watch?v=dQw4w9WgXcQ')
  await expect(page.locator('main .like-pill .dislike')).toHaveText('522K', { timeout: 150_000 })
  const meta = page.locator('.meta').filter({ has: page.locator('a.hashtag') })
  const owner = page.locator('.owner-text a.channel-name')
  const related = page.locator('aside.secondary article a.channel-name').filter({ has: page.locator('[data-badge]') }).first()
  await expect(meta).toBeVisible({ timeout: 150_000 })
  await expect(owner.locator('[data-badge]')).toBeVisible({ timeout: 150_000 })
  await expect(related).toBeVisible({ timeout: 150_000 })
  expect((await meta.boundingBox())!.height, 'the views, date and hashtags take more than one line at 1280').toBe(20)

  for (const width of [1280, 412]) {
    await page.setViewportSize({ width, height: 860 })
    // longer than any column, so the check does not depend on the names in today's related list
    for (const link of [owner, related]) {
      await link.evaluate(element => {
        element.firstChild!.textContent = 'A channel name much longer than its column '.repeat(6)
      })
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `the page scrolls sideways at ${width}`).toBe(0)
    for (const link of [owner, related]) {
      const edges = await rightEdges(link)
      expect(edges.badge, `a long name hides its badge at ${width}`).toBeLessThanOrEqual(edges.link + 0.5)
      expect(edges.link, `a long name runs past its column at ${width}`).toBeLessThanOrEqual(edges.column + 0.5)
    }
  }
})

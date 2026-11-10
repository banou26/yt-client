import { expect, test } from './test'

/* youtube.com's Posts tab, signed out (measured 2026-11-10): a post longer than four lines is cut there with a Read
   more that opens it in place, and its footer's comment count links to /post/<id>, which shows the post and then its
   comments, sorted as on a watch page. */

test('opens a post from the Posts tab by its comment count, on the post and then its comments', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/@mkbhd?tab=COMMUNITY')
  const posts = page.locator('main article.post')
  const link = posts.first().getByRole('link', { name: /^[\d.,]+[KMB]? comments$/ })
  await expect(link).toHaveAttribute('href', /^\/post\/[\w-]+$/, { timeout: 120_000 })

  // held by position: a filter on its Read more would stop matching once that turns into Show less
  await expect(posts.getByRole('button', { name: 'Read more' }).first()).toBeVisible()
  const longIndex = await posts.evaluateAll(elements => elements.findIndex(element => element.querySelector('.read-more')))
  const long = posts.nth(longIndex)
  const height = () => long.locator('.post-text').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }))
  const clamped = await height()
  expect(clamped.height).toBeLessThanOrEqual(clamped.lineHeight * 4 + 1)
  await long.getByRole('button', { name: 'Read more' }).click()
  await expect(long.getByRole('button', { name: 'Show less' })).toBeVisible()
  expect((await height()).height).toBeGreaterThan(clamped.lineHeight * 4 + 1)

  const href = await link.getAttribute('href')
  await link.click()
  await expect(page).toHaveURL(href!)
  await expect(page.locator('main article.post')).toBeVisible({ timeout: 120_000 })
  const comments = page.locator('main section').filter({ has: page.locator('.heading') })
  await expect(comments.locator('.heading')).toHaveText(/^\d{1,3}(,\d{3})* Comments?$/, { timeout: 120_000 })
  await expect(comments.locator('.comment').first()).toBeVisible()

  const top = await comments.locator('.comment').first().textContent()
  await comments.getByRole('button', { name: 'Sort by' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Newest first' }).click()
  await expect(comments.locator('.comment').first()).not.toHaveText(top!, { timeout: 120_000 })
})

import { expect, test } from './test'

/* youtube.com answers each of these addresses with a page of its own, checked headless on 2026-11-10. This client keeps
   most of those pages under another route, so the address either bounces there or opens the same page in place. */

test('opens a live stream\'s Share link, /live/<id>, on its watch page', async ({ page }) => {
  await page.goto('/live/rFZHOHl-L8A?si=shared&t=30')
  await expect(page).toHaveURL('/watch?v=rFZHOHl-L8A&t=30')
})

test('opens an embed address, /embed/<id>, on the watch page at its start', async ({ page }) => {
  await page.goto('/embed/dQw4w9WgXcQ?start=42')
  await expect(page).toHaveURL('/watch?v=dQw4w9WgXcQ&t=42')
})

test('opens /c/<name> on the channel, and its tabs under the same address', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/c/mkbhd')
  await expect(page.locator('main h1')).toHaveText('Marques Brownlee', { timeout: 120_000 })
  await expect(page).toHaveURL('/c/mkbhd')
  await page.getByRole('navigation', { name: 'Channel sections' }).getByRole('button', { name: 'Videos', exact: true }).click()
  await expect(page).toHaveURL('/c/mkbhd?tab=VIDEOS')
  await expect(page.locator('main article a[href^="/watch?v="]').first()).toBeVisible({ timeout: 120_000 })
})

test('opens /user/<name> on the channel, and /user/<name>/<tab> on that tab', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/user/marquesbrownlee/videos')
  await expect(page).toHaveURL('/user/marquesbrownlee?tab=VIDEOS')
  await expect(page.locator('main h1')).toHaveText('Marques Brownlee', { timeout: 120_000 })
  const tabs = page.getByRole('navigation', { name: 'Channel sections' })
  await expect(tabs.getByRole('button', { name: 'Videos', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('opens /gaming on the Gaming topic channel', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/gaming')
  await expect(page).toHaveURL('/channel/UCOpNcN46UbXVtpKMrmU4Abg')
  await expect(page.locator('main h1')).toHaveText('Gaming', { timeout: 120_000 })
})

test('opens /hashtag/<tag> as a search for the tag', async ({ page }) => {
  await page.goto('/hashtag/nevergonnagiveyouup')
  await expect(page).toHaveURL('/results?search_query=%23nevergonnagiveyouup')
  await expect(page.getByRole('combobox', { name: 'Search' })).toHaveValue('#nevergonnagiveyouup')
})

test('opens /post/<id> on the post, and says when there is none', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/post/UgkxX6gkDxQ0KRucvyG7NLui0LhjHp0CLlfZ')
  const post = page.locator('main article.post')
  await expect(post).toContainText('Welcome to the Blind Smartphone Camera Test 2023!', { timeout: 120_000 })
  await expect(post.getByRole('link', { name: 'Marques Brownlee' })).toHaveAttribute('href', '/channel/UCBJycsmduvYEL83R_U4JriQ')

  await page.goto('/post/UgkxNOPENOPENOPENOPENOPENOPENOPENOPE1')
  await expect(page.locator('main .status')).toHaveText('This post isn\'t available.', { timeout: 120_000 })
})

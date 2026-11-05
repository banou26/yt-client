import { expect, test } from './test'

/* youtube.com has no About tab: the header's "...more" and its links line open a dialog with the description, the
   links and the channel's details. */

test('opens the About dialog from the header, with the description, the links and the details', async ({ page }) => {
  test.setTimeout(180_000)
  const unsafeSelectors: string[] = []
  const unkeyed: string[] = []
  page.on('console', message => {
    const text = message.text()
    if (text.includes('potentially unsafe')) unsafeSelectors.push(text)
    if (text.includes('Invalid key') && /ChannelAbout|ChannelLink/.test(text)) unkeyed.push(text)
  })
  await page.goto('/@RickAstleyYT')
  const header = page.locator('main header')
  const first = header.locator('.links').getByRole('link')
  await expect(first).toHaveAttribute('href', /^https:\/\//, { timeout: 120_000 })
  await expect(first, 'a link goes to its destination, not through upstream\'s redirect page').not.toHaveAttribute('href', /youtube\.com\/redirect/)
  await expect(page.getByRole('navigation', { name: 'Channel sections' }).getByRole('button', { name: 'About' })).toHaveCount(0)

  await header.getByRole('button', { name: /\.\.\.more$/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Rick Astley' })
  await expect(dialog.getByRole('heading', { name: 'Description' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Links' })).toBeVisible()
  expect(await dialog.locator('.about-links a').count()).toBeGreaterThan(1)
  await expect(dialog.getByRole('heading', { name: 'More info' })).toBeVisible()
  // youtube.com's order: the country, the joined date, then the counts
  await expect(dialog.locator('.about-details li')).toHaveText([/\S/, /^Joined /, / subscribers$/, / videos$/, / views$/])
  expect(unsafeSelectors, 'Emotion warns on a selector that breaks under server rendering').toEqual([])
  expect(unkeyed, 'graphcache warns on a type it has no key for').toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await header.getByRole('button', { name: /^and \d+ more links?$/ }).click()
  await expect(dialog.getByRole('heading', { name: 'Links' })).toBeVisible()
})

test('opens /about as the channel under its About dialog, and closing it leaves the channel', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/@RickAstleyYT/about')
  await expect(page).toHaveURL('/@RickAstleyYT?tab=ABOUT')
  const dialog = page.getByRole('dialog', { name: 'Rick Astley' })
  await expect(dialog.getByRole('heading', { name: 'Links' })).toBeVisible({ timeout: 120_000 })
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL('/@RickAstleyYT')
  await expect(page.getByRole('navigation', { name: 'Channel sections' }).getByRole('button', { name: 'Home', exact: true }))
    .toHaveAttribute('aria-current', 'page')
})

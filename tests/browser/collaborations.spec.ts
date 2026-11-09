import { expect, test } from './test'

const CLEO = '/channel/UC415bOPUcGSamy543abLmRA'
const MKBHD = '/channel/UCBJycsmduvYEL83R_U4JriQ'
const VIDEO = '/watch?v=e3fz3dqhN44'

// searched by its exact title, so Cleo Abram's video with Marques Brownlee is on the first page
test('names both channels of a collaboration in search: its avatars open the choice of them, its names the video', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto(`/results?search_query=${encodeURIComponent('Quantum Computers, explained with MKBHD')}`)
  const row = page.locator('article.result').filter({ has: page.locator(`a[href="${VIDEO}"]`) }).first()
  await expect(row).toBeVisible({ timeout: 120_000 })

  await expect(row.getByRole('link', { name: /^Cleo Abram Verified and Marques Brownlee Verified$/ })).toHaveAttribute('href', VIDEO)
  const avatars = row.getByRole('button', { name: 'Collaboration channels' })
  await expect(avatars.locator('img')).toHaveCount(2)

  await avatars.click()
  const dialog = page.getByRole('dialog', { name: 'Collaborators' })
  const channels = dialog.getByRole('link')
  await expect(channels).toHaveCount(2)
  await expect(channels.nth(0)).toHaveAttribute('href', CLEO)
  await expect(channels.nth(0)).toContainText('@CleoAbram')
  await expect(channels.nth(1)).toHaveAttribute('href', MKBHD)
  await expect(channels.nth(1)).toContainText('@mkbhd')
  await expect(dialog.getByRole('button', { name: 'Subscribe' })).toHaveCount(0)

  await channels.nth(1).click()
  await expect(page).toHaveURL(new RegExp(`${MKBHD}$`))
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('h1')).toContainText('Marques Brownlee', { timeout: 120_000 })
})

test('names both channels on a collaboration\'s watch page, whose Subscribe opens one for each', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto(VIDEO)
  const owner = page.locator('.owner-row')
  const names = owner.getByRole('button', { name: /^Cleo Abram Verified and Marques Brownlee Verified$/ })
  await expect(names).toBeVisible({ timeout: 120_000 })
  await expect(owner.getByRole('button', { name: 'Collaboration channels' }).locator('img')).toHaveCount(2)
  for (const action of ['Like', 'Dislike', 'Share', 'More actions']) {
    await expect(owner.getByRole('button', { name: action, exact: true })).toBeVisible()
  }

  await owner.getByRole('button', { name: 'Subscribe', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Collaborators' })
  await expect(dialog.getByRole('link')).toHaveCount(2)
  await expect(dialog.getByRole('link').nth(0)).toHaveAttribute('href', CLEO)
  await expect(dialog.getByRole('link').nth(1)).toHaveAttribute('href', MKBHD)
  await expect(dialog.getByRole('button', { name: 'Subscribe', exact: true })).toHaveCount(2)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)

  await names.click()
  await expect(dialog.getByRole('link')).toHaveCount(2)
})


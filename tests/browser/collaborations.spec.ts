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

// a comment names its author by @handle, under the id of the channel the choice lists
test('a collaboration\'s choice keeps its channels\' names once a comment by one of them loads', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto(VIDEO)
  const comments = page.locator('main section').filter({ has: page.locator('.heading') })
  await expect(comments.locator(`a.author[href="${MKBHD}"]`).first()).toHaveText('@mkbhd', { timeout: 120_000 })
  await expect(comments.locator(`a.avatar[href="${MKBHD}"] img`).first()).toHaveAttribute('src', /^https?:\/\//)

  await page.locator('.owner-row').getByRole('button', { name: 'Subscribe', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Collaborators' })
  await expect(dialog.locator('.name')).toHaveText(['Cleo Abram', 'Marques Brownlee'])
})

// channel-home-mkbhd.json's Videos row holds a video that its First Impressions row holds too, which the cache keeps
// as one video with the channel First Impressions gave it
test('a channel\'s own Home uploads name no channel, and a collaboration\'s names open the video', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 90_000 })
  const home = page.locator('[data-channel-home-harness]')
  const videos = home.getByRole('region', { name: 'Videos', exact: true })
  // the harness's first import can add a dependency for the dev server to bundle, which reloads the page under it
  await expect(async () => {
    if (await home.count() === 0) {
      await page.evaluate(async (path) => {
        const harness = await import(path) as { mountChannelHome: () => void }
        harness.mountChannelHome()
      }, '/tests/browser/fixtures/channel-home-harness.tsx')
    }
    await expect(videos.locator('a[href^="/watch?v="]').first()).toBeVisible({ timeout: 15_000 })
  }).toPass({ timeout: 120_000 })
  await expect(videos.locator('.channel-name')).toHaveText(['Marques Brownlee and Auto Focus'])
  await expect(videos.locator('a.channel-name')).toHaveAttribute('href', '/watch?v=scwlR0QHGOk')
  const impressions = home.getByRole('region', { name: 'First Impressions!', exact: true })
  await expect(impressions.locator('.channel-name')).toHaveText(['Marques Brownlee', 'Marques Brownlee and Auto Focus'])
})

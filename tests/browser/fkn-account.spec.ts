import { expect, test } from './test'

/* A fresh profile is signed out of FKN. The guide only lists groups when it is expanded, which needs a viewport wider
   than 1312px. */

test.use({ viewport: { width: 1440, height: 900 } })

test('the More menu offers Sign in to FKN once FKN answered, and groups work signed out of FKN', async ({ page }) => {
  test.setTimeout(150_000)
  let releaseBroker!: () => void
  const brokerHeld = new Promise<void>(resolve => releaseBroker = resolve)
  await page.route('https://fkn.app/api**', async (route) => {
    await brokerHeld
    await route.continue()
  })

  // the held broker frame holds the page's load event too
  await page.goto('/feed/groups', { waitUntil: 'domcontentloaded' })
  const main = page.locator('main')
  await expect(main.getByText('No groups yet')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /FKN/ })).toHaveCount(0)

  releaseBroker()
  await expect(page.getByRole('menuitem', { name: 'Sign in to FKN' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('menuitem', { name: /FKN/ })).toHaveCount(1)
  await page.keyboard.press('Escape')

  for (const name of ['Songs', 'Old']) {
    await main.getByRole('button', { name: 'New group' }).click()
    const dialog = page.getByRole('dialog', { name: 'New group' })
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(main.getByRole('link', { name: new RegExp(name) })).toBeVisible()
  }
  await main.getByRole('button', { name: 'Delete Old' }).click()
  await page.getByRole('dialog', { name: 'Delete Old?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(main.getByRole('link', { name: /Old/ })).toHaveCount(0)

  // the sync heard FKN answer signed out: it keeps this browser's groups and no record of the deletion
  const syncState = () => page.evaluate(() => localStorage.getItem('yt-client:groups-sync'))
  await expect.poll(syncState, { timeout: 30_000 }).toBe('{"deleted":{}}')

  await page.reload()
  await expect(main.getByRole('link', { name: /Songs/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('navigation', { name: 'Guide' }).getByRole('link', { name: 'Songs' })).toBeVisible()
  await expect(main.getByRole('link', { name: /Old/ })).toHaveCount(0)
  expect(await syncState()).toBe('{"deleted":{}}')
})

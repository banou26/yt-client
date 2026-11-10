import type { BrowserContext, Locator, Page, Route } from '@playwright/test'

import type { Which } from './fixtures/menu-data-harness'

import { expect, test } from './test'

const HARNESS = '/tests/browser/fixtures/menu-data-harness.tsx'

const OFFLINE_LINE = 'You\'re offline. Check your connection.'

const DATA_URL = '**/menu-data-harness/**'

const answered = (route: Route) => route.fulfill({ body: '' })

// what a dropped connection makes of a request: youtubei.js reads "failed with status code 500" (measured 2026-11-10)
const serverError = (route: Route) => route.fulfill({ status: 500, body: '' })

// the harness reads its data through DATA_URL, which answers until `drop` and again after `restore`
const open = async (page: Page) => {
  await page.route(DATA_URL, answered)
  await page.goto('/privacy')
}

const mount = async (page: Page, which: Which) => {
  const host = page.locator(`[data-menu-data-harness="${which}"]`)
  // the harness's first import can add a dependency for the dev server to bundle, which reloads the page under it
  await expect(async () => {
    if (await host.count() === 0) {
      await page.evaluate(async ([path, which]) => (await import(path) as typeof import('./fixtures/menu-data-harness')).mountMenuData(which), [HARNESS, which] as const)
    }
    await expect(host).toBeAttached({ timeout: 5_000 })
  }).toPass({ timeout: 120_000 })
  return host
}

const drop = (page: Page) => page.route(DATA_URL, serverError)

const restore = (page: Page) => page.unroute(DATA_URL, serverError)

const backOnline = async (page: Page, context: BrowserContext) => {
  await context.setOffline(true)
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
  await context.setOffline(false)
}

const lineShown = async (scope: Locator) => {
  await expect(scope.getByText(OFFLINE_LINE, { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(scope).not.toContainText(/status code|youtubei|Request to/)
}

test('the notifications menu whose data failed says so in one line and loads once the browser is back online', async ({ page, context }) => {
  await open(page)
  const host = await mount(page, 'notifications')
  await drop(page)
  await host.getByRole('button', { name: 'Notifications' }).click()
  const menu = page.getByRole('menu', { name: 'Notifications' })
  await lineShown(menu)

  await restore(page)
  await backOnline(page, context)
  await expect(menu.getByRole('menuitem', { name: 'Channel 1 uploaded: Video 1' })).toBeVisible()
  await expect(menu).not.toContainText(OFFLINE_LINE)
})

test('the notifications menu whose later page failed says so at the end of the list and loads it on a new open', async ({ page }) => {
  await open(page)
  const host = await mount(page, 'notifications')
  const bell = host.getByRole('button', { name: 'Notifications' })
  await bell.click()
  const menu = page.getByRole('menu', { name: 'Notifications' })
  await expect(menu.getByRole('menuitem', { name: 'Channel 1 uploaded: Video 1' })).toBeVisible()

  await drop(page)
  await menu.getByRole('menuitem', { name: 'Show more' }).click()
  await lineShown(menu)
  await expect(menu.getByRole('menuitem').last()).toHaveText(OFFLINE_LINE)
  await expect(menu.getByRole('menuitem', { name: 'Show more' })).toHaveCount(0)

  await restore(page)
  await page.keyboard.press('Escape')
  await bell.click()
  await expect(menu.getByRole('menuitem', { name: 'Channel 2 uploaded: Video 2' })).toBeVisible()
  await expect(menu).not.toContainText(OFFLINE_LINE)
})

test('the Save menu whose data failed says so in one line and loads once the browser is back online', async ({ page, context }) => {
  await open(page)
  const host = await mount(page, 'save')
  await drop(page)
  await host.getByRole('button', { name: 'Save' }).click()
  const menu = page.getByRole('menu', { name: 'Save to playlist' })
  await lineShown(menu)

  await restore(page)
  await backOnline(page, context)
  await expect(menu.getByRole('menuitemcheckbox', { name: /Playlist 1/ })).toBeVisible()
  await expect(menu).not.toContainText(OFFLINE_LINE)
})

test('the Save menu whose data failed loads when it is opened again', async ({ page }) => {
  await open(page)
  const host = await mount(page, 'save')
  await drop(page)
  const save = host.getByRole('button', { name: 'Save' })
  await save.click()
  const menu = page.getByRole('menu', { name: 'Save to playlist' })
  await lineShown(menu)

  await restore(page)
  await page.keyboard.press('Escape')
  await save.click()
  await expect(menu.getByRole('menuitemcheckbox', { name: /Playlist 1/ })).toBeVisible()
  await expect(menu).not.toContainText(OFFLINE_LINE)
})

test('a video row menu\'s playlists that failed say so in one line and load once the browser is back online', async ({ page, context }) => {
  await open(page)
  const host = await mount(page, 'row')
  await drop(page)
  await host.getByRole('button', { name: 'More actions for Video 0' }).click()
  const menu = page.getByRole('menu', { name: 'More actions for Video 0' })
  await menu.getByRole('menuitem', { name: 'Save to playlist' }).click()
  await lineShown(menu)

  await restore(page)
  await backOnline(page, context)
  await expect(menu.getByRole('menuitemcheckbox', { name: /Playlist 1/ })).toBeVisible()
  await expect(menu).not.toContainText(OFFLINE_LINE)
})

const playlistMenus = [
  { which: 'save', label: 'the Save menu', button: 'Save', menu: 'Save to playlist' },
  { which: 'row', label: 'a video row menu', button: 'More actions for Video 0', menu: 'More actions for Video 0' },
] as const

for (const { which, label, button, menu: name } of playlistMenus) {
  test(`${label}'s later playlists that failed say so at the end of the list and load once the browser is back online`, async ({ page, context }) => {
    await open(page)
    const host = await mount(page, which)
    await host.getByRole('button', { name: button }).click()
    const menu = page.getByRole('menu', { name })
    if (which === 'row') await menu.getByRole('menuitem', { name: 'Save to playlist' }).click()
    await expect(menu.getByRole('menuitemcheckbox', { name: /Playlist 1/ })).toBeVisible()

    await drop(page)
    await menu.getByRole('menuitem', { name: 'Show more' }).click()
    await lineShown(menu)
    await expect(menu.getByRole('menuitem', { name: OFFLINE_LINE })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Show more' })).toHaveCount(0)

    await restore(page)
    await backOnline(page, context)
    await expect(menu.getByRole('menuitemcheckbox', { name: /Playlist 2/ })).toBeVisible()
    await expect(menu).not.toContainText(OFFLINE_LINE)
  })
}

test('the group dialog whose subscriptions failed says so in one line and loads on Try again', async ({ page }) => {
  await open(page)
  await drop(page)
  await mount(page, 'group')
  const dialog = page.getByRole('dialog', { name: 'New group' })
  const alert = dialog.getByRole('alert')
  await lineShown(alert)
  await expect(dialog.getByRole('button', { name: 'Create' })).toBeInViewport({ ratio: 1 })

  await restore(page)
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(dialog.getByRole('checkbox', { name: 'Channel 1' })).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
})

test('the group dialog whose subscriptions failed loads them once the browser is back online', async ({ page, context }) => {
  await open(page)
  await drop(page)
  await mount(page, 'group')
  const dialog = page.getByRole('dialog', { name: 'New group' })
  await lineShown(dialog)

  await restore(page)
  await backOnline(page, context)
  await expect(dialog.getByRole('checkbox', { name: 'Channel 1' })).toBeVisible()
  await expect(dialog).not.toContainText(OFFLINE_LINE)
})

// the toasts are the app's own, which the harness's components share
const toastShown = (page: Page) => lineShown(page.getByRole('status'))

test('saving to a playlist that failed says so in one line', async ({ page }) => {
  await open(page)
  const host = await mount(page, 'save')
  await host.getByRole('button', { name: 'Save' }).click()
  const playlist = page.getByRole('menu', { name: 'Save to playlist' }).getByRole('menuitemcheckbox', { name: /Playlist 1/ })
  await expect(playlist).toBeVisible()

  await drop(page)
  await playlist.click()
  await toastShown(page)
})

test('creating a playlist that failed says so in one line', async ({ page }) => {
  await open(page)
  const host = await mount(page, 'save')
  await host.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('menu', { name: 'Save to playlist' }).getByRole('menuitem', { name: 'Create new playlist' }).click()
  const dialog = page.getByRole('dialog', { name: 'New playlist' })
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Playlist 3')

  await drop(page)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await toastShown(page)
})

test('saving from a video row menu that failed says so in one line', async ({ page }) => {
  await open(page)
  const host = await mount(page, 'row')
  await host.getByRole('button', { name: 'More actions for Video 0' }).click()
  const menu = page.getByRole('menu', { name: 'More actions for Video 0' })
  await menu.getByRole('menuitem', { name: 'Save to playlist' }).click()
  const playlist = menu.getByRole('menuitemcheckbox', { name: /Playlist 1/ })
  await expect(playlist).toBeVisible()

  await drop(page)
  await playlist.click()
  await toastShown(page)
})

test('marking a notification read that failed says so in one line', async ({ page }) => {
  await open(page)
  const host = await mount(page, 'notifications')
  await host.getByRole('button', { name: 'Notifications' }).click()
  const notification = page.getByRole('menu', { name: 'Notifications' }).getByRole('menuitem', { name: 'Channel 1 uploaded: Video 1' })
  await expect(notification).toBeVisible()

  await drop(page)
  await notification.click()
  await toastShown(page)
})

test('subscribing that failed says so in one line', async ({ page }) => {
  await open(page)
  const host = await mount(page, 'subscribe')

  await drop(page)
  await host.getByRole('button', { name: 'Subscribe' }).click()
  await toastShown(page)
})

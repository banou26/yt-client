import type { BrowserContext, Page, Route } from '@playwright/test'

import { expect, laneOrigin, test } from './test'

const OFFLINE_LINE = 'You\'re offline. Check your connection.'

type Endpoint = 'search' | 'browse' | 'next'

const endpointUrl = (endpoint: Endpoint) => new RegExp(`^https://www\\.youtube\\.com/youtubei/v1/${endpoint}\\?`)

/* Signed out on laneOrigin, InnerTube is asked from the page itself, so these routes are the page's data requests.
   An answer is final whatever its status; a request that gets no answer at all is sent again through the Scramjet
   frame, which a route here cannot reach, so the failures below are answers. */
const fail = (page: Page, endpoint: Endpoint, answer: (route: Route) => Promise<void>) => page.route(endpointUrl(endpoint), answer)

const restore = (page: Page, endpoint: Endpoint) => page.unroute(endpointUrl(endpoint))

// what a dropped connection makes of a request: youtubei.js reads "failed with status code 500" (measured 2026-11-10)
const serverError = (route: Route) =>
  route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: '' })

// YouTube's own answer, cut off midway as a connection that drops while it arrives leaves it
const cutShort = async (route: Route) => {
  const response = await route.fetch()
  await route.fulfill({ response, body: (await response.text()).slice(0, 4000) })
}

// the first failure the page shows; a watch page's comments, which read the same endpoint, show one of their own
const failureShown = async (page: Page) => {
  const alert = page.locator('main').getByRole('alert').first()
  await expect(alert.locator('p')).toHaveText(OFFLINE_LINE, { timeout: 120_000 })
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/status code|youtubei|JSON/)
  return alert
}

const backOnline = async (page: Page, context: BrowserContext) => {
  await context.setOffline(true)
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
  await context.setOffline(false)
}

const noFailure = (page: Page) => expect(page.locator('main').getByRole('alert')).toHaveCount(0)

test('a search whose data failed says so in one line and loads on Try again', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  await fail(page, 'search', serverError)
  await page.goto(`${laneOrigin(baseURL)}/results?search_query=rick+astley`)
  const alert = await failureShown(page)

  await restore(page, 'search')
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('main a[href^="/watch"]').first()).toBeVisible({ timeout: 60_000 })
  await noFailure(page)
})

test('a search whose answer was cut short loads by itself once the browser is back online', async ({ page, context, baseURL }) => {
  test.setTimeout(240_000)
  await fail(page, 'search', cutShort)
  await page.goto(`${laneOrigin(baseURL)}/results?search_query=rick+astley`)
  await failureShown(page)

  await restore(page, 'search')
  await backOnline(page, context)
  await expect(page.locator('main a[href^="/watch"]').first()).toBeVisible({ timeout: 60_000 })
  await noFailure(page)
})

test('a search that fails again right as the browser comes back online loads once the connection settles', async ({ page, context, baseURL }) => {
  test.setTimeout(240_000)
  let answered = 0
  await fail(page, 'search', (route) => {
    answered += 1
    return serverError(route)
  })
  await page.goto(`${laneOrigin(baseURL)}/results?search_query=rick+astley`)
  await failureShown(page)
  const before = answered

  await backOnline(page, context)
  await expect.poll(() => answered, { message: 'the try at online' }).toBeGreaterThan(before)
  await failureShown(page)
  await restore(page, 'search')
  await expect(page.locator('main a[href^="/watch"]').first()).toBeVisible({ timeout: 15_000 })
  await noFailure(page)
})

test('a channel whose data failed loads by itself once the browser is back online', async ({ page, context, baseURL }) => {
  test.setTimeout(240_000)
  await fail(page, 'browse', serverError)
  await page.goto(`${laneOrigin(baseURL)}/channel/UCuAXFkgsw1L7xaCfnd5JJOw`)
  await failureShown(page)

  await restore(page, 'browse')
  await backOnline(page, context)
  await expect(page.locator('main h1')).toHaveText('Rick Astley', { timeout: 60_000 })
  await noFailure(page)
})

test('a playlist whose data failed loads on Try again', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  await fail(page, 'browse', serverError)
  await page.goto(`${laneOrigin(baseURL)}/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI`)
  const alert = await failureShown(page)

  await restore(page, 'browse')
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('main a[href^="/watch"]').first()).toBeVisible({ timeout: 60_000 })
  await noFailure(page)
})

test('Home whose data failed loads by itself once the browser is back online', async ({ page, context, baseURL }) => {
  test.setTimeout(240_000)
  await fail(page, 'browse', serverError)
  await page.goto(`${laneOrigin(baseURL)}/`)
  await failureShown(page)

  await restore(page, 'browse')
  await backOnline(page, context)
  await expect(page.getByRole('heading', { name: 'Try searching to get started' })).toBeVisible({ timeout: 60_000 })
  await noFailure(page)
})

test('a watch page whose data failed loads its details and comments once the browser is back online', async ({ page, context, baseURL }) => {
  test.setTimeout(240_000)
  await fail(page, 'next', serverError)
  await page.goto(`${laneOrigin(baseURL)}/watch?v=dQw4w9WgXcQ`)
  await failureShown(page)

  await restore(page, 'next')
  await backOnline(page, context)
  await expect(page.locator('main h1.title')).toContainText('Rick Astley', { timeout: 60_000 })
  await expect(page.locator('main').getByRole('heading', { name: /Comments/ })).toBeVisible({ timeout: 60_000 })
  await noFailure(page)
})

test('a playlist that does not exist shows youtube.com\'s own line, with nothing to try again', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/playlist?list=PLzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')
  await expect(page.locator('main .notice')).toHaveText('The playlist does not exist.', { timeout: 120_000 })
  await noFailure(page)
})

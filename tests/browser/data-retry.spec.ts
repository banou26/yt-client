import type { BrowserContext, Locator, Page, Route } from '@playwright/test'

import { expect, laneOrigin, test } from './test'

const OFFLINE_LINE = 'You\'re offline. Check your connection.'

type Endpoint = 'search' | 'browse' | 'next'

const endpointUrl = (endpoint: Endpoint) => new RegExp(`^https://www\\.youtube\\.com/youtubei/v1/${endpoint}\\?`)

/* Signed out on laneOrigin, InnerTube is asked from the page itself, so these routes are the page's data requests.
   An answer is final whatever its status; a request that gets no answer at all is sent again through the Scramjet
   frame, which a route here cannot reach, so the failures below are answers. */
const fail = (page: Page, endpoint: Endpoint, answer: (route: Route) => Promise<void>) => page.route(endpointUrl(endpoint), answer)

const failWhen = (page: Page, endpoint: Endpoint, matches: (body: string) => boolean, answer: (route: Route) => Promise<void>) =>
  page.route(endpointUrl(endpoint), route => matches(route.request().postData() ?? '') ? answer(route) : route.fallback())

const isContinuation = (body: string) => body.includes('"continuation"')

// a channel tab's browse names its tab in `params`, a protobuf whose bytes spell it out
const isPostsTab = (body: string) => {
  const params = (JSON.parse(body) as { params?: string }).params
  return params !== undefined && /posts|community/.test(Buffer.from(decodeURIComponent(params), 'base64').toString('latin1'))
}

const restore = (page: Page, endpoint: Endpoint) => page.unroute(endpointUrl(endpoint))

// what a dropped connection makes of a request: youtubei.js reads "failed with status code 500" (measured 2026-11-10)
const serverError = (route: Route) =>
  route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: '' })

// YouTube's own answer, cut off midway as a connection that drops while it arrives leaves it
const cutShort = async (route: Route) => {
  const response = await route.fetch()
  await route.fulfill({ response, body: (await response.text()).slice(0, 4000) })
}

const failureShown = async (page: Page, scope: Locator = page.locator('main')) => {
  const alert = scope.getByRole('alert')
  await expect(alert.locator('p')).toHaveText(OFFLINE_LINE, { timeout: 120_000 })
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/status code|youtubei|JSON|Couldn/)
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
  // one line for the page: the comments read the same endpoint, so they wait for the details rather than fail beside them
  const main = page.locator('main')
  await expect(main.getByRole('alert').or(main.getByRole('heading', { name: /Comments/ }))).toHaveCount(1)

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

test('a channel\'s later page that failed says so at the bottom of the list, under the header it keeps', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  await page.goto(`${laneOrigin(baseURL)}/channel/UCuAXFkgsw1L7xaCfnd5JJOw/videos`)
  const videos = page.locator('main .videos a[href^="/watch"]')
  await expect(videos.first()).toBeVisible({ timeout: 120_000 })
  const before = await videos.count()

  await failWhen(page, 'browse', isContinuation, serverError)
  const toBottom = () => page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await toBottom()
  const alert = await failureShown(page)
  // the page that loaded by itself on arrival can have moved the end of the list since the scroll
  await toBottom()
  await expect(alert).toBeInViewport()
  await expect(page.locator('main h1')).toHaveText('Rick Astley')

  await restore(page, 'browse')
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect.poll(() => videos.count(), { timeout: 60_000 }).toBeGreaterThan(before)
  await noFailure(page)
})

test('a channel\'s Posts that failed say so in one line rather than that there are none, and load on Try again', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  // the channel's own read of the tab comes first and is kept, so the Posts list's read is the one that fails
  let postsReads = 0
  await failWhen(page, 'browse', body => isPostsTab(body) && ++postsReads > 1, serverError)
  await page.goto(`${laneOrigin(baseURL)}/@mkbhd/posts`)
  const alert = await failureShown(page, page.locator('main .videos'))
  await expect(page.locator('main')).not.toContainText('This channel has no posts.')

  await restore(page, 'browse')
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('main article.post').first()).toBeVisible({ timeout: 60_000 })
  await noFailure(page)
})

test('a watch page\'s later comments that failed say so under the list and load on Try again', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  await page.goto(`${laneOrigin(baseURL)}/watch?v=dQw4w9WgXcQ`)
  const comments = page.locator('main section').filter({ has: page.locator('.heading') })
  await expect(comments.locator('.comment').first()).toBeVisible({ timeout: 120_000 })
  const before = await comments.locator('.comment').count()

  await fail(page, 'next', serverError)
  await comments.getByRole('button', { name: 'Show more', exact: true }).click()
  const alert = await failureShown(page, comments)

  await restore(page, 'next')
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect.poll(() => comments.locator('.comment').count(), { timeout: 60_000 }).toBeGreaterThan(before)
  await noFailure(page)
})

test('a comment\'s replies that failed say so in one line and load on Try again', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  await page.goto(`${laneOrigin(baseURL)}/watch?v=dQw4w9WgXcQ`)
  const thread = page.locator('main .comment').filter({ has: page.locator('button.replies') }).first()
  await expect(thread).toBeVisible({ timeout: 120_000 })

  await fail(page, 'next', serverError)
  await thread.locator('button.replies').click()
  const alert = await failureShown(page, thread)

  await restore(page, 'next')
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(thread.locator('.reply-row').first()).toBeVisible({ timeout: 60_000 })
  await noFailure(page)
})

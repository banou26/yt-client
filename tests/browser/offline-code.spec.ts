import type { Page, Route } from '@playwright/test'
import type { AddressInfo } from 'node:net'

import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from './test'

/* These run on the built app (`npm run build` first), served as Cloudflare Pages serves it, since the dev server
   writes no list of the code to download. */

const BUILD = fileURLToPath(new URL('../../build/', import.meta.url))
const TYPES: Record<string, string> = {
  '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2',
}

const fileAt = (path: string) => path.includes('..')
  ? undefined
  : [path, `${path}.html`].map(name => BUILD + name.slice(1)).find(file => existsSync(file) && statSync(file).isFile())

// a page by its path with or without .html, the app at any other path, and a missing assets/ file 404 with its page
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  const asset = path.startsWith('/assets/')
  const found = fileAt(path)
  const file = found ?? (asset ? `${BUILD}assets/404.html` : `${BUILD}index.html`)
  response.writeHead(asset && !found ? 404 : 200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': asset ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
  })
  response.end(readFileSync(file))
})

let origin = ''

test.beforeAll(async () => {
  expect(existsSync(`${BUILD}index.html`), 'no build to serve: run npm run build first').toBe(true)
  await new Promise<void>(resolve => server.listen(0, 'localhost', resolve))
  origin = `http://localhost:${(server.address() as AddressInfo).port}`
})

test.afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

const drop = (route: Route) => route.abort('internetdisconnected')
const deploy = (route: Route) => route.fulfill({
  status: 404,
  contentType: 'text/html; charset=utf-8',
  body: readFileSync(`${BUILD}assets/404.html`),
})

// records each modulepreload link that loaded, and marks the document, so a reload, which would also show every page,
// cannot pass for a recovery
const open = async (page: Page, path: string) => {
  await page.addInitScript(() => {
    const preloaded = new Set<string>()
    Object.assign(window, { preloaded })
    document.addEventListener('load', ({ target }) => {
      if (target instanceof HTMLLinkElement && target.rel === 'modulepreload') preloaded.add(new URL(target.href).pathname)
    }, true)
  })
  await page.goto(origin + path)
  await page.evaluate(() => Object.assign(window, { sameDocument: true }))
}

// every listed file in the document: its link fired load, which a fetch alone never does
const warmedUp = async (page: Page) => {
  const list = JSON.parse(await page.locator('#lazy-code').textContent({ timeout: 10_000 }) ?? '[]') as string[]
  expect(list.length).toBeGreaterThan(30)
  await expect.poll(
    () => page.evaluate(hrefs => hrefs.filter(href => !(window as unknown as { preloaded: Set<string> }).preloaded.has(href)), list),
    { timeout: 60_000, message: 'files whose link never loaded' },
  ).toEqual([])
}

const failedLine = (page: Page) => page.getByRole('alert').filter({ has: page.getByRole('button', { name: /^(Try again|Reload)$/ }) })

const expectPage = async (page: Page, heading: string) => {
  const title = page.getByRole('heading', { name: heading, level: 1, exact: true })
  await expect(title.or(failedLine(page))).toBeVisible({ timeout: 30_000 })
  await expect(failedLine(page)).toHaveCount(0)
  await expect(title).toBeVisible()
  expect(await page.evaluate(() => 'sameDocument' in window), 'the page reloaded').toBe(true)
}

const visit = async (page: Page, path: string, heading: string) => {
  await page.evaluate((path) => {
    history.pushState(null, '', path)
    dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await expectPage(page, heading)
}

const visitEveryKind = async (page: Page) => {
  await visit(page, '/settings', 'Settings')
  await visit(page, '/feed/history', 'Watch history')
  await visit(page, '/privacy', 'Privacy')
  const input = page.getByRole('combobox', { name: 'Search' })
  await input.fill('rick astley')
  await input.press('Enter')
  await expectPage(page, 'Results for rick astley')
}

test('a page opened during a network drop still loads, once the app downloaded every page\'s code', async ({ page }) => {
  await open(page, '/')
  await warmedUp(page)
  await page.route(`${origin}/assets/**`, drop)
  await visitEveryKind(page)
})

test('a page opened after a deploy removed its files still loads', async ({ page }) => {
  await open(page, '/')
  await warmedUp(page)
  await page.route(`${origin}/assets/**`, deploy)
  await visitEveryKind(page)
})

test('a docked video keeps playing while a page opens during a network drop', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page, '/watch?v=dQw4w9WgXcQ')
  const video = page.locator('video')
  const time = () => video.evaluate(element => (element as HTMLVideoElement).currentTime)
  await expect(video).toBeVisible({ timeout: 60_000 })
  await expect.poll(time, { timeout: 120_000, message: 'playback did not start' }).toBeGreaterThan(1)

  const dock = page.getByRole('complementary', { name: 'Miniplayer' })
  await visit(page, '/settings', 'Settings')
  await expect(dock).toBeVisible()
  await warmedUp(page)
  await page.route(`${origin}/assets/**`, drop)
  await visit(page, '/privacy', 'Privacy')
  const before = await time()
  await expect.poll(time, { timeout: 30_000 }).toBeGreaterThan(before + 1)
  expect(await video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false)
  await expect(dock).toBeVisible()
})

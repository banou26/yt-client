import type { Page, Request } from '@playwright/test'

import { firefox } from '@playwright/test'

import { dismissFknNotice, expect, test } from './test'

/* InnerTube answers a simple request from http://localhost with 403 and no Access-Control-Allow-Origin, and from
   http://youtube.localhost with its ACAO (measured 2026-11-02, curl, /youtubei/v1/guide), so the lane is driven from
   youtube.localhost on the configured port. Both arms use that origin, so the flag is the only difference. */
const laneOrigin = (baseURL: string | undefined) => {
  const url = new URL(baseURL ?? 'http://localhost:4561')
  url.hostname = 'youtube.localhost'
  return url.origin
}

const turnOn = (page: Page) => page.addInitScript(() => localStorage.setItem('yt-client:step:direct', '1'))

type Seen = { url: string, method: string, mainFrame: boolean, headers: Record<string, string> }

// every InnerTube request the page makes, sorted into those it sent itself and those its Scramjet frame sent through the proxy
const watchInnertube = (page: Page) => {
  const direct: Promise<Seen>[] = []
  const proxied: string[] = []
  page.on('request', (request: Request) => {
    const url = request.url()
    if (url.startsWith('https://www.youtube.com/youtubei/v1/')) {
      direct.push(request.allHeaders().then((headers) => ({
        url,
        method: request.method(),
        mainFrame: request.frame() === page.mainFrame(),
        headers,
      })))
    } else if (url.includes('/__yt_scramjet__/proxy/') && decodeURIComponent(url).includes('/youtubei/v1/')) {
      proxied.push(decodeURIComponent(url))
    }
  })
  return { direct: () => Promise.all(direct), proxied }
}

const homeSettled = (page: Page) => expect.poll(
  () => page.evaluate(() =>
    document.querySelectorAll('a[href^="/watch"]').length > 0 || /Try searching to get started/i.test(document.body.innerText)),
  { timeout: 90_000 },
).toBe(true)

const searchShown = async (page: Page) => {
  await expect(page.locator('a[href^="/watch"]').first()).toBeVisible({ timeout: 90_000 })
  expect(await page.locator('a[href^="/watch"]').count()).toBeGreaterThanOrEqual(5)
}

const expectSimple = (request: Seen) => {
  expect(request.method).toBe('POST')
  expect(request.mainFrame).toBe(true)
  expect(request.headers['content-type']).toBe('text/plain;charset=UTF-8')
  for (const name of ['x-origin', 'x-goog-visitor-id', 'x-youtube-client-name', 'x-youtube-client-version', 'cookie', 'authorization']) {
    expect(request.headers, `${request.url} carried ${name}`).not.toHaveProperty(name)
  }
}

test('with the direct step on and signed out, home and a search send InnerTube from the page', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  const origin = laneOrigin(baseURL)
  await turnOn(page)
  const innertube = watchInnertube(page)

  await page.goto(`${origin}/`)
  await homeSettled(page)
  await expect(page.locator('html')).toHaveAttribute('data-yt-direct', 'on')

  await page.goto(`${origin}/results?search_query=blender`)
  await searchShown(page)
  await expect(page.locator('html')).toHaveAttribute('data-yt-direct', 'on')

  const direct = await innertube.direct()
  expect(direct.map(({ url }) => new URL(url).pathname)).toEqual(expect.arrayContaining(['/youtubei/v1/browse', '/youtubei/v1/search']))
  for (const request of direct) expectSimple(request)
  expect(innertube.proxied).toEqual([])
})

test('with the direct step on, a watch page plays and seeks', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  await turnOn(page)
  const innertube = watchInnertube(page)
  await page.goto(`${laneOrigin(baseURL)}/watch/dQw4w9WgXcQ`)
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime), { timeout: 120_000 })
    .toBeGreaterThan(1)
  await video.evaluate((element) => {
    (element as HTMLVideoElement).currentTime = 90
  })
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime), { timeout: 60_000 })
    .toBeGreaterThan(92)
  await expect(page.locator('html')).toHaveAttribute('data-yt-direct', 'on')
  expect((await innertube.direct()).length).toBeGreaterThan(0)
  expect(innertube.proxied).toEqual([])
})

test('with the direct step off, InnerTube goes through the Scramjet frame as before (control)', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  const origin = laneOrigin(baseURL)
  const innertube = watchInnertube(page)
  await page.goto(`${origin}/`)
  await homeSettled(page)
  await page.goto(`${origin}/results?search_query=blender`)
  await searchShown(page)
  await expect(page.locator('html')).toHaveAttribute('data-yt-direct', 'off')
  expect(await innertube.direct()).toEqual([])
  // the watch can see a proxied InnerTube request, so its empty list in the other arms means none was sent
  expect(innertube.proxied.some((url) => url.includes('/youtubei/v1/search'))).toBe(true)
})

test('with the direct step on and direct requests failing, a search still shows through the Scramjet frame', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  await turnOn(page)
  const innertube = watchInnertube(page)
  await page.route('https://www.youtube.com/youtubei/**', (route) => route.abort('failed'))
  await page.goto(`${laneOrigin(baseURL)}/results?search_query=blender`)
  await searchShown(page)
  await expect(page.locator('html')).toHaveAttribute('data-yt-direct', 'skipped')
  expect(innertube.proxied.some((url) => url.includes('/youtubei/v1/search'))).toBe(true)
})

// Firefox refuses youtubei.js's preflighted shape from this origin, so this is the case the simple shape exists for
test('in Firefox, with the direct step on, a search sends InnerTube from the page', async ({ baseURL }) => {
  test.setTimeout(240_000)
  // the runner hands every browser type the config's launch options, so Chrome's executable and arguments are cleared
  const browser = await firefox.launch({
    headless: true,
    executablePath: undefined,
    args: [],
    firefoxUserPrefs: { 'media.volume_scale': '0.0' },
  })
  try {
    const page = await browser.newPage()
    await dismissFknNotice(page)
    await turnOn(page)
    const innertube = watchInnertube(page)
    await page.goto(`${laneOrigin(baseURL)}/results?search_query=blender`)
    await searchShown(page)
    await expect(page.locator('html')).toHaveAttribute('data-yt-direct', 'on')
    const direct = await innertube.direct()
    expect(direct.map(({ url }) => new URL(url).pathname)).toContain('/youtubei/v1/search')
    for (const request of direct) expectSimple(request)
    expect(innertube.proxied).toEqual([])
  } finally {
    await browser.close()
  }
})

import type { BrowserContext, Page } from '@playwright/test'

import { test as base } from '@playwright/test'

export { expect } from '@playwright/test'

const fknDismiss = (page: Page) =>
  page.frameLocator('iframe[title="FKN"]').getByRole('button', { name: 'Dismiss', exact: true })

// FKN shows this notice over the bottom corner once the day's free data is used. A dispatched click, never a pointer
// one: clicking into FKN's frame takes the focus off the page, so a box being typed in closes its suggestions and the
// spec's next key lands at the start of the box (measured 2026-11-10, the notice up about 1 s after the engine ready)
export const dismissFknNotice = (page: Page) =>
  page.addLocatorHandler(fknDismiss(page), dismiss => dismiss.dispatchEvent('click'))

// for a spec that holds the pointer on one card: the notice is hidden rather than dismissed, so nothing covers the card
export const hideFknNotice = async (page: Page) => {
  await page.removeLocatorHandler(fknDismiss(page))
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent = 'iframe[title="FKN"] { visibility: hidden !important; pointer-events: none !important; }'
    const add = () => document.documentElement.append(style)
    if (document.documentElement) add()
    else document.addEventListener('DOMContentLoaded', add, { once: true })
  })
}

/**
 * Answers the watch page's third-party lookups with nothing, so no spec depends on their live data. Every fixture
 * context gets it; a spec that makes its own context calls it too. A page route still wins over these.
 */
export const answerLookups = async (context: BrowserContext) => {
  await context.route('https://returnyoutubedislikeapi.com/**', route =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { likes: 0, dislikes: 0 } }))
  await context.route('https://sponsor.ajay.app/**', route =>
    route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, json: [] }))
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await answerLookups(context)
    await use(context)
  },
  page: async ({ page }, use) => {
    await dismissFknNotice(page)
    await use(page)
  },
})

/**
 * `test` in a Chrome that does not announce automation, for specs that seek far or play live.
 *
 * Upstream treats an automated browser differently: with navigator.webdriver true every far seek walls, on
 * youtube.com's own previews as much as on ours (measured 2026-11-10), and every live answer is status 2, then 3, so
 * nothing plays past about 30 s (YTB-28). Headless Chrome's HeadlessChrome user agent does the same to live (measured
 * 2026-11-06, status 1 once the agent names plain Chrome).
 */
export const plainTest = test.extend<object, object>({
  userAgent: async ({ browser }, use) => {
    await use(`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`)
  },
  browser: [async ({ playwright, browserName, headless, launchOptions }, use) => {
    const browser = await playwright[browserName].launch({
      ...launchOptions,
      headless,
      args: [...(launchOptions.args ?? []), '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    })
    await use(browser)
    await browser.close()
  }, { scope: 'worker' }],
})

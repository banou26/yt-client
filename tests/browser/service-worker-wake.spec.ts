import { expect, test } from '@playwright/test'

/* Chrome stops Scramjet's service worker after 30 s with no event, and the request that starts it again arrives
   before the page's controller registers with the new instance. Left to the network, a catalog POST reaches the
   static host, which answers 405 on Pages and 404 under Vite. The stop is forced, since a worker Playwright is
   attached to never idles out. */
test('routes the catalog read that starts Scramjet\'s stopped service worker', async ({ page }) => {
  test.setTimeout(180_000)
  let restarts = 0
  page.context().on('console', (message) => {
    if (message.text().includes('service worker activated, notifying clients to revive')) restarts++
  })
  await page.goto('/')
  await expect(page.locator('main a[href^="/watch"], main .empty').first()).toBeVisible({ timeout: 90_000 })
  const before = restarts

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('ServiceWorker.enable')
  await cdp.send('ServiceWorker.stopAllWorkers')

  // client-side, so the read is the first request the stopped worker sees rather than a page load
  await page.evaluate(() => {
    history.pushState(null, '', '/channel/UCSMOQeBJ2RAnuFungnQOxLg')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('main h1, main .status').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('main')).not.toContainText('status code')
  await expect(page.locator('main h1')).toBeVisible()
  expect(restarts, 'the service worker never started again, so the stop proved nothing').toBeGreaterThan(before)
})

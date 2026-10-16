import { expect, test } from '@playwright/test'

/* Chrome ends Scramjet's service worker with its network service, and the worker that starts next routes
   nothing until the page's controller registers with it again. Stopped right after the engine is ready,
   inside the five seconds the stock controller ignores a restarted worker for; left that way, playback waits
   for an idle stop at least 30 s later, so the first frame is held to the startup budget. */
test('plays when Scramjet\'s service worker starts again during startup', async ({ page }) => {
  test.setTimeout(180_000)
  let restarts = 0
  page.context().on('console', (message) => {
    if (message.text().includes('service worker activated, notifying clients to revive')) restarts++
  })
  await page.goto('/watch?v=dQw4w9WgXcQ')
  await page.waitForFunction(
    () => performance.getEntriesByName('yt:engine-ready', 'mark').length > 0,
    null,
    { timeout: 60_000 },
  )
  const before = restarts

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('ServiceWorker.enable')
  await cdp.send('ServiceWorker.stopAllWorkers')

  await page.waitForFunction(
    () => performance.getEntriesByName('yt:first-frame', 'mark').length > 0,
    null,
    { timeout: 25_000 },
  )
  expect(restarts, 'the service worker never started again, so the stop proved nothing').toBeGreaterThan(before)
})

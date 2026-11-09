import { expect, test } from './test'

test('the page draws its text in the Roboto it serves itself, fetched once, with no request to Google Fonts', async ({ page }) => {
  const google: string[] = []
  page.on('request', request => {
    if (new URL(request.url()).hostname === 'fonts.googleapis.com') google.push(request.url())
  })
  await page.goto('/privacy')
  await expect(page.locator('main h1')).toHaveText('Privacy')
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toBe('Roboto, Arial, sans-serif')

  // the font the text is drawn with, which the computed family above only asks for
  const session = await page.context().newCDPSession(page)
  await session.send('DOM.enable')
  await session.send('CSS.enable')
  const { root } = await session.send('DOM.getDocument')
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'main p' })
  await expect.poll(async () => (await session.send('CSS.getPlatformFontsForNode', { nodeId })).fonts
    .map(({ familyName, isCustomFont }) => ({ familyName, isCustomFont })), { timeout: 30_000 })
    .toEqual([{ familyName: 'Roboto', isCustomFont: true }])

  const origin = new URL(page.url()).origin
  const latin = await page.evaluate(() => performance.getEntriesByType('resource').map(({ name }) => name)
    .filter(name => /\/(src\/fonts\/roboto-latin|assets\/roboto-latin-[\w-]{8})\.woff2$/.test(name)))
  expect(latin).toEqual([expect.stringMatching(new RegExp(`^${origin}/`))])
  expect(google).toEqual([])
})

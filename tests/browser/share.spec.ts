import { expect, test } from './test'

const VIDEO_ID = 'dQw4w9WgXcQ'

// youtube.com's targets in its order, measured signed out at 1280 and 412 px on 2026-11-10
const TARGETS = ['Embed', 'Messages', 'WhatsApp', 'Facebook', 'X', 'Email', 'Reddit', 'Pinterest', 'LinkedIn']

test('offers youtube.com\'s share targets, each opening its share address with the link', async ({ page }) => {
  test.setTimeout(240_000)
  // a stub answers each share page, so no test visits it
  await page.context().route(/^https:\/\/(wa\.me|twitter\.com)\//, route => route.fulfill({ contentType: 'text/html', body: '' }))
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const title = (await page.locator('main h1').first().textContent({ timeout: 120_000 }))!.trim()
  const share = page.locator('.actions').getByRole('button', { name: 'Share', exact: true })
  await share.click()
  const dialog = page.getByRole('dialog', { name: 'Share' })

  await expect(dialog.locator('.target')).toHaveText(TARGETS)
  const marks = await dialog.locator('.target svg').evaluateAll(svgs => svgs.map((svg) => {
    const box = svg.getBoundingClientRect()
    return { x: box.x, width: box.width, height: box.height }
  }))
  expect(marks.map(({ width, height }) => [width, height])).toEqual(TARGETS.map(() => [60, 60]))
  expect(marks[1]!.x - marks[0]!.x).toBe(78)

  // the row scrolls by its arrows to the last target and back
  const linkedIn = dialog.getByRole('link', { name: 'LinkedIn', exact: true })
  await expect(linkedIn).not.toBeInViewport({ ratio: 1 })
  await dialog.getByRole('button', { name: 'More share targets', exact: true }).click()
  await expect(linkedIn).toBeInViewport({ ratio: 1 })
  await expect(dialog.getByRole('button', { name: 'More share targets', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Previous share targets', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Embed', exact: true })).toBeInViewport({ ratio: 1 })

  const link = dialog.getByRole('textbox', { name: 'Share link' })
  await expect(link).toHaveValue(new RegExp(`/watch\\?v=${VIDEO_ID}$`))
  const opened = page.waitForEvent('popup')
  await dialog.getByRole('link', { name: 'WhatsApp', exact: true }).click()
  const whatsApp = await opened
  await expect(whatsApp).toHaveURL(`https://wa.me/?text=${encodeURIComponent(await link.inputValue())}`)
  await whatsApp.close()

  // X carries the title too, and a target carries the start once Start at is checked
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  const video = page.locator('[data-player-root] video')
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 120_000 }).toBeGreaterThan(1)
  await share.click()
  await dialog.getByRole('checkbox', { name: /^Start at / }).check()
  await expect(link).toHaveValue(new RegExp(`/watch\\?v=${VIDEO_ID}&t=\\d+$`))
  const openedX = page.waitForEvent('popup')
  await dialog.getByRole('link', { name: 'X', exact: true }).click()
  const x = await openedX
  await expect(x).toHaveURL(`https://twitter.com/intent/tweet?url=${encodeURIComponent(await link.inputValue())}&text=${encodeURIComponent(title)}`)
  await x.close()

  await dialog.getByRole('button', { name: 'Embed', exact: true }).click()
  const embed = page.getByRole('dialog', { name: 'Embed Video' })
  await expect(embed.getByRole('textbox', { name: 'Embed code' })).toHaveValue(new RegExp(`src="https://www\\.youtube\\.com/embed/${VIDEO_ID}\\?start=\\d+"`))
  await expect(dialog).toHaveCount(0)
})

test.describe('on a touch phone', () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })

  test('hands Share to the device\'s share sheet with the link, as m.youtube.com does', async ({ page }) => {
    test.setTimeout(240_000)
    await page.addInitScript(() => {
      const shared: ShareData[] = []
      Object.assign(window, { shared })
      Object.defineProperty(Navigator.prototype, 'share', {
        configurable: true,
        value: (data: ShareData) => {
          shared.push(data)
          return Promise.resolve()
        },
      })
    })
    await page.goto(`/watch?v=${VIDEO_ID}`)
    const share = page.locator('.actions').getByRole('button', { name: 'Share', exact: true })
    await share.tap({ timeout: 120_000 })
    await expect.poll(() => page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared))
      .toEqual([{ url: `${new URL(page.url()).origin}/watch?v=${VIDEO_ID}` }])
    await expect(page.getByRole('dialog', { name: 'Share' })).toHaveCount(0)

    // a sheet the browser refuses leaves the dialog
    await page.evaluate(() => Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      value: () => Promise.reject(new DOMException('refused', 'NotAllowedError')),
    }))
    await share.tap()
    await expect(page.getByRole('dialog', { name: 'Share' }).getByRole('link', { name: 'WhatsApp', exact: true })).toBeVisible()
  })
})

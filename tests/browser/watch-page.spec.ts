import { expect, test } from '@playwright/test'

/* The watch page around the player, against the live source: `dQw4w9WgXcQ` has hashtags, a description whose second line is blank and whose third is short, and millions of comments. */

const VIDEO = '/watch?v=dQw4w9WgXcQ'

test('collapses the description to the rounded counts and three lines, with an inline ...more', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto(VIDEO)
  const box = page.locator('main div:has(> .snippet)')
  const more = box.getByRole('button', { name: '...more' })
  await expect(more).toBeVisible({ timeout: 90_000 })

  await expect(box.locator('.counts')).toHaveText(/^[\d.]+[KMB]? views\s+\S+ ago$/)
  expect(await box.locator('.hashtag').count()).toBeGreaterThan(0)
  const layout = await box.evaluate((element) => {
    const text = element.querySelector('.text')!
    const button = element.querySelector('.more')!
    const textBox = text.getBoundingClientRect()
    const buttonBox = button.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(text)
    const lineEnd = Math.max(textBox.left, ...[...range.getClientRects()]
      .filter(rect => rect.width > 0 && rect.top + rect.height / 2 > buttonBox.top && rect.top + rect.height / 2 < buttonBox.bottom)
      .map(rect => rect.right))
    return {
      clamp: getComputedStyle(text).webkitLineClamp,
      height: textBox.height,
      lineHeight: Number.parseFloat(getComputedStyle(text).lineHeight),
      bottomGap: Math.abs(textBox.bottom - buttonBox.bottom),
      afterText: buttonBox.left - lineEnd,
      roomRight: textBox.right - buttonBox.right,
    }
  })
  // a line clamp draws its own ellipsis on the last kept line, a lone one when that line is blank
  expect(layout.clamp).toBe('none')
  expect(layout.height).toBeLessThanOrEqual(layout.lineHeight * 3 + 1)
  expect(layout.bottomGap).toBeLessThan(2)
  // the third line is short, so ...more follows its text rather than the box's right edge
  expect(layout.afterText).toBeGreaterThanOrEqual(0)
  expect(layout.afterText).toBeLessThan(12)
  expect(layout.roomRight).toBeGreaterThan(100)

  await box.click()
  await expect(box.locator('.counts')).toHaveText(/^[\d,]+ views\s+[A-Z][a-z]{2} \d{1,2}, \d{4}$/)
  await expect(box.getByRole('button', { name: 'Show less' })).toBeVisible()
  await expect(more).toHaveCount(0)
  expect(await box.locator('.text').evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(layout.lineHeight * 3 + 1)
})

test('grows the sidebar and its thumbnails on a wide window, like youtube.com', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(VIDEO)
  await expect(page.locator('main aside article').first()).toBeVisible({ timeout: 90_000 })
  const measure = () => page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    return {
      viewport: document.documentElement.clientWidth,
      player: box('main .stage').width,
      aside: box('main aside').width,
      asideRight: box('main aside').right,
      thumb: box('main aside article .thumb').width,
    }
  })

  // youtube.com at 1920: a 1344 px player beside a 528 px sidebar of 330 px thumbnails, reaching the window's edge
  const wide = await measure()
  expect(wide.aside).toBeCloseTo(528, 0)
  expect(wide.player).toBeGreaterThan(1300)
  expect(wide.viewport - wide.asideRight).toBeLessThanOrEqual(24)
  expect(wide.thumb).toBeGreaterThan(320)

  // and the 402 px sidebar of 168 px thumbnails stays below the width where 27.5% of the window passes it
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect.poll(async () => (await measure()).aside).toBeCloseTo(402, 0)
  expect((await measure()).thumb).toBeCloseTo(168, 0)
})

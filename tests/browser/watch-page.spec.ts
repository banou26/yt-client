import { expect, test } from './test'

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

// youtube.com on this video, signed out, 2026-11-10: the player, the sidebar and its first thumbnail
const YOUTUBE_SIZES = [
  { width: 1280, height: 800, player: { x: 16, y: 68, width: 880, height: 495 }, aside: { x: 912, width: 352 }, thumb: { width: 220, height: 123.75 } },
  { width: 1024, height: 768, player: { x: 16, y: 68, width: 656, height: 369 }, aside: { x: 688, width: 320 }, thumb: { width: 200, height: 112.5 } },
  { width: 1440, height: 900, player: { x: 16, y: 68, width: 996, height: 560.25 }, aside: { x: 1028, width: 396 }, thumb: { width: 247.5, height: 139.22 } },
] as const

const expectClose = (actual: Record<string, number>, expected: Record<string, number>, what: string) => {
  for (const [key, value] of Object.entries(expected)) expect(actual[key], `${what}: ${key}`).toBeCloseTo(value, 0)
}

test('sizes the player, the sidebar and its thumbnails like youtube.com', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(VIDEO)
  await expect(page.locator('main aside article .thumb').first()).toBeVisible({ timeout: 90_000 })
  await expect(page.locator('main h1.title')).toBeVisible({ timeout: 90_000 })
  const measure = () => page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    const player = box('main .stage [data-player-root]')
    const aside = box('main aside')
    const thumb = box('main aside article .thumb')
    const title = box('main h1.title')
    return {
      player: { x: player.x, y: player.y, width: player.width, height: player.height },
      aside: { x: aside.x, width: aside.width },
      thumb: { width: thumb.width, height: thumb.height },
      title: { x: title.x, below: title.y - player.bottom },
    }
  })

  for (const size of YOUTUBE_SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height })
    await expect.poll(async () => (await measure()).player.width, { message: `the player's width at ${size.width}` }).toBeCloseTo(size.player.width, 0)
    const layout = await measure()
    expectClose(layout.player, size.player, `the player at ${size.width}`)
    expectClose(layout.aside, size.aside, `the sidebar at ${size.width}`)
    expectClose(layout.thumb, size.thumb, `a related thumbnail at ${size.width}`)
    expectClose(layout.title, { x: 16, below: 12 }, `the title at ${size.width}`)
  }

  // theater keeps the same columns under its edge to edge player
  const [narrow] = YOUTUBE_SIZES
  await page.setViewportSize({ width: narrow.width, height: narrow.height })
  await page.locator('main h1.title').click()
  await page.keyboard.press('t')
  await expect(page.locator('main.theater')).toBeAttached()
  await expect.poll(async () => (await measure()).player.width).toBeCloseTo(narrow.width, 0)
  const theater = await measure()
  expectClose(theater.aside, narrow.aside, 'the theater sidebar')
  expectClose(theater.thumb, narrow.thumb, 'a related thumbnail in theater')
  expect(theater.title.x, 'the theater title\'s left edge').toBeCloseTo(16, 0)
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
      playerLeft: box('main .stage').left,
      playerRight: box('main .stage').right,
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

  // a short window holds the player to the 16:9 frame under the header, 1216 px here, and gives the sidebar the rest rather than centering the two
  await page.setViewportSize({ width: 1920, height: 800 })
  await expect.poll(async () => (await measure()).player).toBeCloseTo(1216, 0)
  const short = await measure()
  expect(short.playerLeft).toBeCloseTo(16, 0)
  expect(short.viewport - short.asideRight).toBeCloseTo(16, 0)
  expect(short.aside).toBeCloseTo(656, 0)

  // theater runs edge to edge, even on an ultrawide window where the two columns center
  await page.setViewportSize({ width: 2560, height: 1080 })
  await page.locator('main h1').click()
  await page.keyboard.press('t')
  await expect(page.locator('main.theater')).toBeAttached()
  await expect.poll(async () => (await measure()).playerLeft).toBeLessThanOrEqual(0.5)
  const theater = await measure()
  expect(theater.viewport - theater.playerRight).toBeLessThanOrEqual(0.5)
})

test('heads the comments with the full count and Sort by, and threads them like youtube.com', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto(VIDEO)
  const comments = page.locator('main section').filter({ has: page.locator('.heading') })
  // the comments read's own header; the rounded '2.4M' alone was the heading before
  await expect(comments.locator('.heading')).toHaveText(/^\d{1,3}(,\d{3})+ Comments$/, { timeout: 120_000 })
  await expect(comments.locator('.sort')).toHaveText('Sort by')

  const first = comments.locator('.comment').first()
  // signed out too, as on youtube.com, where it leads to sign-in
  await expect(first.getByRole('button', { name: 'Reply', exact: true })).toBeVisible()

  // held by position: a filter on its Read more would stop matching once that turns into Show less
  await expect(comments.getByRole('button', { name: 'Read more' }).first()).toBeVisible()
  const longIndex = await comments.locator('.comment').evaluateAll(elements => elements.findIndex(element => element.querySelector('.read-more')))
  const long = comments.locator('.comment').nth(longIndex)
  const height = () => long.locator('.comment-text').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element.firstElementChild!).lineHeight),
  }))
  const clamped = await height()
  expect(clamped.height).toBeLessThanOrEqual(clamped.lineHeight * 4 + 1)
  await long.getByRole('button', { name: 'Read more' }).click()
  await expect(long.getByRole('button', { name: 'Show less' })).toBeVisible()
  expect((await height()).height).toBeGreaterThan(clamped.lineHeight * 4 + 1)

  // youtube.com's reply count: the comment's own text color, with the chevron after the count
  const toggle = first.locator('button.replies')
  const look = await toggle.evaluate(element => ({
    color: getComputedStyle(element).color,
    text: getComputedStyle(element.closest('.comment')!.querySelector('.text')!).color,
    chevronLast: element.lastElementChild?.tagName.toLowerCase() === 'svg',
  }))
  expect(look.color).toBe(look.text)
  expect(look.chevronLast).toBe(true)

  // each reply row holds its own lines, rather than spilling them over the next row
  await toggle.click()
  const rows = first.locator('.reply-list > div:has(.comment-text)')
  await expect(rows.first()).toBeVisible({ timeout: 60_000 })
  const spills = await rows.evaluateAll(elements => elements.filter(element => element.scrollHeight > element.clientHeight + 1).length)
  expect(spills).toBe(0)
})

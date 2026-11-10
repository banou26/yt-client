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
  { width: 1010, height: 800, player: { x: 16, y: 68, width: 642, height: 361.1 }, aside: { x: 674, width: 320 }, thumb: { width: 200, height: 112.5 } },
  { width: 1024, height: 768, player: { x: 16, y: 68, width: 656, height: 369 }, aside: { x: 688, width: 320 }, thumb: { width: 200, height: 112.5 } },
  { width: 1440, height: 900, player: { x: 16, y: 68, width: 996, height: 560.25 }, aside: { x: 1028, width: 396 }, thumb: { width: 247.5, height: 139.22 } },
  { width: 1920, height: 1080, player: { x: 16, y: 68, width: 1344, height: 756 }, aside: { x: 1376, width: 528 }, thumb: { width: 330, height: 185.6 } },
  // a short window holds the player to the 16:9 frame under the header, gives the sidebar the rest up to 35% of the window, and centers what is left
  { width: 1920, height: 800, player: { x: 16, y: 68, width: 1216, height: 684 }, aside: { x: 1248, width: 656 }, thumb: { width: 410, height: 230.6 } },
  { width: 1920, height: 600, player: { x: 185.8, y: 68, width: 860.4, height: 484 }, aside: { x: 1062.2, width: 672 }, thumb: { width: 420, height: 236.25 } },
  { width: 1280, height: 450, player: { x: 88, y: 68, width: 640, height: 360 }, aside: { x: 744, width: 448 }, thumb: { width: 280, height: 157.5 } },
  // the title column holds 640 px and keeps the left margin, so the sidebar runs into the right one
  { width: 1000, height: 800, player: { x: 16, y: 68, width: 640, height: 360 }, aside: { x: 672, width: 320 }, thumb: { width: 200, height: 112.5 } },
] as const

// youtube.com's default view in one column, from 999 px down, signed out, 2026-11-11: the player edge to edge under the
// header with square corners as in theater, the window height less 169 px at most and never under 240 px, the title
// 12 px under it, the sidebar under that, 16 px margins
const YOUTUBE_ONE_COLUMN = [
  { width: 999, height: 800, player: { x: 0, y: 56, width: 999, height: 561.94, radius: 0 }, title: { x: 16, width: 967 } },
  { width: 800, height: 600, player: { x: 0, y: 56, width: 800, height: 431, radius: 0 }, title: { x: 16, width: 768 } },
  { width: 600, height: 800, player: { x: 0, y: 56, width: 600, height: 337.5, radius: 0 }, title: { x: 16, width: 568 } },
  // the title there is yt-client's own, with 12 px margins: youtube.com holds a 426.67 px column and scrolls sideways
  { width: 412, height: 800, player: { x: 0, y: 56, width: 412, height: 240, radius: 0 } },
] as const

// youtube.com's theater on this video, signed out, 2026-11-10: the window height less 169 px, never under 480 px in two
// columns or 240 px in one, the title 12 px and the sidebar 24 px under the player, in the default view's columns
const YOUTUBE_THEATER = [
  { width: 1280, height: 800, player: { x: 0, y: 56, width: 1280, height: 631 }, title: { x: 16, width: 880 }, aside: { x: 912, width: 352 }, thumb: { width: 220, height: 123.75, below: 24 } },
  { width: 1920, height: 1080, player: { x: 0, y: 56, width: 1920, height: 911 }, title: { x: 16, width: 1344 }, aside: { x: 1376, width: 528 }, thumb: { width: 330, height: 185.6, below: 24 } },
  { width: 1280, height: 600, player: { x: 0, y: 56, width: 1280, height: 480 }, title: { x: 16, width: 860.4 }, aside: { x: 892.4, width: 371.6 }, thumb: { width: 232.25, height: 130.6, below: 24 } },
  // a short or very wide window centers the columns under the player, as the default view does
  { width: 1280, height: 450, player: { x: 0, y: 56, width: 1280, height: 480 }, title: { x: 88, width: 640 }, aside: { x: 744, width: 448 }, thumb: { width: 280, height: 157.5, below: 24 } },
  { width: 2560, height: 1080, player: { x: 0, y: 56, width: 2560, height: 911 }, title: { x: 65.1, width: 1713.8 }, aside: { x: 1794.9, width: 700 }, thumb: { width: 437.5, height: 246.1, below: 24 } },
  // the title column holds 640 px, so the two overflow the window's margins evenly
  { width: 1000, height: 800, player: { x: 0, y: 56, width: 1000, height: 562.5 }, title: { x: 12, width: 640 }, aside: { x: 668, width: 320 }, thumb: { width: 200, height: 112.5, below: 24 } },
  { width: 800, height: 600, player: { x: 0, y: 56, width: 800, height: 431 }, title: { x: 16, width: 768 } },
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
    const radius = Number.parseFloat(getComputedStyle(document.querySelector('main .stage [data-player-root]')!).borderTopLeftRadius)
    // from the element before the list rather than from the player, since the comments above it load at their own pace
    const list = document.querySelector('main aside')!
    const above = list.firstElementChild!.getBoundingClientRect().top - list.previousElementSibling!.getBoundingClientRect().bottom
    return {
      player: { x: player.x, y: player.y, width: player.width, height: player.height, radius },
      aside: { x: aside.x, width: aside.width, below: aside.y - player.bottom, above },
      thumb: { width: thumb.width, height: thumb.height, below: thumb.y - player.bottom },
      title: { x: title.x, width: title.width, below: title.y - player.bottom },
    }
  })

  for (const size of YOUTUBE_SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height })
    await expect.poll(async () => (await measure()).player.width, { message: `the player's width at ${size.width}x${size.height}` }).toBeCloseTo(size.player.width, 0)
    const layout = await measure()
    const at = `${size.width}x${size.height}`
    expectClose(layout.player, size.player, `the player at ${at}`)
    expectClose(layout.aside, size.aside, `the sidebar at ${at}`)
    expectClose(layout.thumb, size.thumb, `a related thumbnail at ${at}`)
    expectClose(layout.title, { x: layout.player.x, below: 12 }, `the title at ${at}`)
  }

  const oneColumnAbove = new Map<string, number>()
  for (const size of YOUTUBE_ONE_COLUMN) {
    await page.setViewportSize({ width: size.width, height: size.height })
    const at = `${size.width}x${size.height}`
    await expect.poll(async () => (await measure()).aside.below, { message: `the sidebar under the player at ${at}` }).toBeGreaterThan(0)
    const layout = await measure()
    expectClose(layout.player, size.player, `the player in one column at ${at}`)
    expect(layout.title.below, `the title's gap under the player in one column at ${at}`).toBeCloseTo(12, 0)
    if ('title' in size) expectClose(layout.title, size.title, `the title in one column at ${at}`)
    oneColumnAbove.set(at, layout.aside.above)
  }

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.locator('main h1.title').click()
  await page.keyboard.press('t')
  await expect(page.locator('main.theater')).toBeAttached()
  for (const size of YOUTUBE_THEATER) {
    await page.setViewportSize({ width: size.width, height: size.height })
    await expect.poll(async () => (await measure()).player.width, { message: `the theater player's width at ${size.width}x${size.height}` }).toBeCloseTo(size.width, 0)
    const layout = await measure()
    const at = `theater at ${size.width}x${size.height}`
    expectClose(layout.player, size.player, `the player in ${at}`)
    expect(layout.title.below, `the title's gap under the player in ${at}`).toBeCloseTo(12, 0)
    expectClose(layout.title, size.title, `the title in ${at}`)
    const above = oneColumnAbove.get(`${size.width}x${size.height}`)
    if (above !== undefined) expect(layout.aside.above, `the space above the related list in ${at}, as in the default view`).toBeCloseTo(above, 0)
    if ('aside' in size) {
      expectClose(layout.aside, size.aside, `the sidebar in ${at}`)
      expectClose(layout.thumb, size.thumb, `a related thumbnail in ${at}`)
    }
  }
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

// a signed-out read says INDIFFERENT, as a signed-in one does, so the press used to send the rating and fail
test('opens the sign-in window from Like and Dislike signed out', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto(VIDEO)
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.engine), { timeout: 90_000 }).toBe('ready')
  await expect(page.locator('header').getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 60_000 })
  for (const name of ['Like', 'Dislike']) {
    const opened = page.context().waitForEvent('page', { timeout: 30_000 })
    await page.locator('main').getByRole('button', { name, exact: true }).first().click()
    const popup = await opened
    await expect(popup).toHaveURL(/\/__yt_scramjet__\/signin(?:\.html)?$/)
    await popup.close()
  }
})

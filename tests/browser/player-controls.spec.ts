import type { Page } from '@playwright/test'

import { expect, test } from './test'

/* The player bar against the live source: `dQw4w9WgXcQ` has captions and a related list, so every control is drawn,
   and no chapters; `jNQXAC9IVRw` is 19 s long with three chapters, Intro, The cool thing (from 5 s) and End (from 17 s). */

const VIDEO_ID = 'dQw4w9WgXcQ'
const CHAPTERED_ID = 'jNQXAC9IVRw'

const startPlayback = async (page: Page) => {
  const video = page.locator('video')
  await expect(video).toBeVisible({ timeout: 60_000 })
  await expect.poll(
    () => video.evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 120_000, message: 'playback did not start' },
  ).toBeGreaterThan(1)
  return video
}

const player = (page: Page) => page.locator('[data-player-root]')

const labels = (page: Page) => player(page).evaluate((root) => {
  const controls = root.querySelector('[aria-label="Seek"]')!.parentElement!
  return [...controls.querySelectorAll('button, input, [role]')].map(control => control.getAttribute('aria-label') ?? '')
})

// the clock is the group that shrinks, so a squeezed bar shows up as a clipped clock long before anything overflows
const fit = (page: Page) => player(page).evaluate((root) => {
  const edge = root.getBoundingClientRect()
  const bar = root.querySelector('.bar')!
  const time = bar.querySelector('.time')!
  const shown = [...bar.querySelectorAll('button, .group')].map(item => item.getBoundingClientRect()).filter(box => box.width > 0)
  return {
    width: Math.round(edge.width),
    overflow: bar.scrollWidth - bar.clientWidth,
    outside: shown.filter(box => box.left < edge.left - 0.5 || box.right > edge.right + 0.5 || box.bottom > edge.bottom + 0.5).length,
    clipped: time.scrollWidth - time.clientWidth > 1,
    chapter: bar.querySelector('.chapter')?.clientWidth ?? 0,
  }
})

// the volume slider opens on a 0.2 s transition, and a measure taken before it ends sees the room it has not taken yet
const settle = (page: Page) => player(page).evaluate(async (root) => {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  await Promise.all(root.querySelector('.bar')!.getAnimations({ subtree: true }).map(animation => animation.finished))
})

const pointAt = async (page: Page, target: 'player' | 'volume') => {
  if (target === 'volume') await player(page).locator('.volume').hover()
  else {
    const box = (await player(page).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 4)
  }
  await settle(page)
}

const expectFits = async (page: Page, width: number) => {
  await expect.poll(async () => (await fit(page)).width, { message: `the player is not ${width} px wide` }).toBe(width)
  for (const target of ['player', 'volume'] as const) {
    await pointAt(page, target)
    const { overflow, outside, clipped } = await fit(page)
    expect(overflow, `the bar overflows a ${width} px player, pointer on the ${target}`).toBeLessThanOrEqual(0)
    expect(outside, `a control sits outside a ${width} px player, pointer on the ${target}`).toBe(0)
    expect(clipped, `the clock clips in a ${width} px player, pointer on the ${target}`).toBe(false)
  }
}

const EVERY_CONTROL = [
  /^(Play|Pause)$/,
  /^Next$/,
  /^(Mute|Unmute)$/,
  /^Volume$/,
  /^Seek$/,
  /^Autoplay$/,
  /^Turn (on|off) captions$/,
  /^Settings$/,
  /^Theater mode$/,
  /^(Exit full screen|Full screen)$/,
]

const expectLabelled = async (page: Page) => {
  const named = await labels(page)
  expect(named, 'a control has no label').not.toContain('')
  for (const pattern of EVERY_CONTROL) expect(named.some(label => pattern.test(label)), `no control is labelled ${pattern}`).toBe(true)
}

test('every control keeps its label, and the bar fits a 1920, 1280, 640 and 400 px player', async ({ page }) => {
  test.setTimeout(300_000)
  await page.addInitScript(() => localStorage.setItem('yt-client:settings', JSON.stringify({ theater: true })))
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`/watch?v=${VIDEO_ID}`)
  const video = await startPlayback(page)
  await expect(page.getByRole('button', { name: 'Turn on captions' })).toBeAttached({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeAttached({ timeout: 60_000 })
  await video.evaluate(element => (element as HTMLVideoElement).pause())
  // Next comes from the same watch read as the chapters, so their absence here is settled
  await expect(player(page).locator('.chapter')).toHaveCount(0)

  await expectFits(page, 1920)
  await expectLabelled(page)
  // youtube.com's grouping: the play circle on its own, and the right-hand controls sharing one rounded group
  const grouping = await player(page).evaluate((root) => {
    const control = (name: string) => root.querySelector(`.bar [aria-label="${name}"]`)
    const shape = control('Settings')?.closest('.group')
    const style = shape ? getComputedStyle(shape) : undefined
    return {
      shared: Boolean(shape) && control('Full screen')?.closest('.group') === shape,
      radius: style ? Number.parseFloat(style.borderRadius) : 0,
      washed: style !== undefined && style.backgroundColor !== 'rgba(0, 0, 0, 0)',
      circle: control('Play')?.classList.contains('group') ?? false,
      rail: Math.round(root.getBoundingClientRect().bottom - root.querySelector('.rail')!.getBoundingClientRect().bottom),
    }
  })
  // the rail as youtube.com draws it, 57 px up: 1 px above the 56 px row of groups
  expect(grouping).toEqual({ shared: true, radius: 28, washed: true, circle: true, rail: 57 })

  await page.setViewportSize({ width: 1280, height: 800 })
  await expectFits(page, 1280)
  await expectLabelled(page)

  await page.setViewportSize({ width: 640, height: 800 })
  await expectFits(page, 640)
  await expectLabelled(page)

  // a phone's width: the miniplayer, also 400 px, draws youtube.com's own controls instead of this bar
  await page.setViewportSize({ width: 400, height: 800 })
  await expectFits(page, 400)
  await expectLabelled(page)
  for (const name of ['Play', 'Next', /^(Mute|Unmute)$/, 'Settings', 'Full screen']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('switch', { name: 'Autoplay' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Theater mode' })).toBeHidden()
})

test('names the chapter the playhead is in, beside the clock', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto(`/watch?v=${CHAPTERED_ID}`)
  const video = await startPlayback(page)
  const seek = (seconds: number) => video.evaluate((element, to) => {
    const media = element as HTMLVideoElement
    media.pause()
    media.currentTime = to
  }, seconds)
  const chapter = player(page).locator('.chapter')

  await seek(1)
  await expect(chapter).toHaveText('Intro', { timeout: 60_000 })
  await seek(6)
  await expect(chapter).toHaveText('The cool thing')
  await seek(18)
  await expect(chapter).toHaveText('End')

  const [clock, title] = await Promise.all([player(page).locator('.time').boundingBox(), chapter.boundingBox()])
  expect(title!.x).toBeGreaterThanOrEqual(clock!.x + clock!.width)
  expect(title!.y).toBeCloseTo(clock!.y, 0)
  expect((await fit(page)).overflow).toBeLessThanOrEqual(0)

  // narrower, the title goes before the clock would clip, rather than shrinking to an empty pill
  await seek(6)
  await expect(chapter).toHaveText('The cool thing')
  // 792, 736 and 616 px players: each window is narrower than the last, so the poll waits for the resize
  let previous = (await fit(page)).width
  for (const width of [840, 760, 640]) {
    await page.setViewportSize({ width, height: 800 })
    await expect.poll(async () => (await fit(page)).width).toBeLessThan(previous)
    for (const target of ['player', 'volume'] as const) {
      await pointAt(page, target)
      const measured = await fit(page)
      const where = `a ${measured.width} px player, pointer on the ${target}`
      expect(measured.clipped, `the clock clips in ${where}`).toBe(false)
      expect(measured.overflow, `the bar overflows ${where}`).toBeLessThanOrEqual(0)
      expect(measured.chapter === 0 || measured.chapter >= 80, `the chapter is a ${measured.chapter} px sliver in ${where}`).toBe(true)
      previous = measured.width
    }
  }
})

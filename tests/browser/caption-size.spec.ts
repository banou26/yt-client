import type { Page } from '@playwright/test'

import { expect, plainTest as test } from './test'

/* The caption size keys against the live source: `dQw4w9WgXcQ` publishes an authored English track. */

const VIDEO = '/watch?v=dQw4w9WgXcQ'

type DomNode = { nodeId: number, attributes?: string[], children?: DomNode[], shadowRoots?: DomNode[], contentDocument?: DomNode }

const startPlayback = async (page: Page) => {
  await page.goto(VIDEO)
  await page.waitForFunction(() => performance.getEntriesByName('yt:first-frame', 'mark').length > 0, null, { timeout: 120_000 })
}

// paused inside a cue, so the cue stays drawn
const holdOnCue = (page: Page) => expect.poll(() => page.locator('video').evaluate((element) => {
  const video = element as HTMLVideoElement
  const cue = [...video.textTracks].find(track => track.mode === 'showing')?.cues?.[3]
  if (!cue) return false
  video.pause()
  video.currentTime = (cue.startTime + cue.endTime) / 2
  return true
}), { timeout: 60_000 }).toBe(true)

/**
 * The drawn cue's size against the browser's own default, and whether it shows. The cue lives in the video's shadow
 * tree, which only the DevTools protocol reaches.
 */
const cueReader = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const style = async (nodeId: number) => {
    const { computedStyle } = await cdp.send('CSS.getComputedStyleForNode', { nodeId })
    return (name: string) => computedStyle.find(property => property.name === name)?.value ?? ''
  }
  return async () => {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true }) as { root: DomNode }
    const found = new Map<string, number>()
    const walk = (node: DomNode) => {
      const attributes = node.attributes ?? []
      const pseudo = attributes.indexOf('pseudo')
      if (pseudo % 2 === 0) found.set(attributes[pseudo + 1]!, node.nodeId)
      for (const child of [...node.children ?? [], ...node.shadowRoots ?? [], ...node.contentDocument ? [node.contentDocument] : []]) walk(child)
    }
    walk(root)
    const cue = found.get('cue')
    const container = found.get('-webkit-media-text-track-container')
    if (cue === undefined || container === undefined) return undefined
    const [cueStyle, base] = [await style(cue), await style(container)]
    return {
      size: Math.round(parseFloat(cueStyle('font-size')) / parseFloat(base('font-size')) * 100),
      visibility: cueStyle('visibility'),
      base: parseFloat(base('font-size')),
    }
  }
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('yt-client:settings') ?? '{}').captionSize)

test('+ and - step the captions through youtube.com\'s sizes, on or off, and the size stays for the next visit', async ({ page }) => {
  test.setTimeout(300_000)
  await startPlayback(page)
  await page.getByRole('button', { name: 'Turn on captions' }).click()
  await holdOnCue(page)
  const cue = await cueReader(page)
  const sized = (size: number) => expect.poll(async () => (await cue())?.size, { timeout: 30_000 }).toBe(size)
  await sized(100)
  const sample = page.getByText('Captions look like this', { exact: true })
  await expect(sample).toHaveCount(0)

  // the sample stands in for the captions at their new size for about a second
  await page.keyboard.press('Shift+Equal')
  await expect(sample).toBeVisible()
  expect(await cue()).toMatchObject({ size: 150, visibility: 'hidden' })
  const sampleSize = await sample.evaluate(element => parseFloat(getComputedStyle(element).fontSize))
  expect(sampleSize / (await cue())!.base).toBeCloseTo(1.5, 1)
  await expect(sample).toBeHidden({ timeout: 3_000 })
  expect(await cue()).toMatchObject({ size: 150, visibility: 'visible' })
  expect(await stored(page)).toBe(150)

  await page.keyboard.press('Equal')
  await sized(200)
  await expect(sample).toBeHidden({ timeout: 3_000 })
  // at the top step nothing changes and no sample shows, read once since a waiting count would outlast a sample
  await page.keyboard.press('Shift+Equal')
  await page.waitForTimeout(300)
  expect(await sample.count()).toBe(0)
  expect((await cue())?.size).toBe(200)
  // the numpad's keys are not these
  await page.keyboard.press('NumpadSubtract')
  await page.waitForTimeout(300)
  expect((await cue())?.size).toBe(200)

  await page.keyboard.press('Minus')
  await page.keyboard.press('Shift+Minus')
  await page.keyboard.press('Minus')
  await sized(50)
  await expect(sample).toBeHidden({ timeout: 3_000 })
  await page.keyboard.press('Minus')
  await page.waitForTimeout(300)
  expect(await sample.count()).toBe(0)
  expect(await stored(page)).toBe(50)

  // with captions off the keys still size them, and the sample shows what they will look like
  await page.keyboard.press('c')
  await expect(page.getByRole('button', { name: 'Turn on captions' })).toBeVisible()
  await page.keyboard.press('Shift+Equal')
  await expect(sample).toBeVisible()
  await page.keyboard.press('Shift+Equal')
  await expect.poll(() => stored(page)).toBe(150)

  await page.keyboard.press('Shift+Slash')
  const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(shortcuts.locator('.row')).toContainText([
    'Rotate through font sizes (increasing)+',
    'Rotate through font sizes (decreasing)-',
  ])
  await page.keyboard.press('Escape')

  await startPlayback(page)
  await page.getByRole('button', { name: 'Turn on captions' }).click()
  await holdOnCue(page)
  const next = await cueReader(page)
  await expect.poll(async () => (await next())?.size, { timeout: 30_000 }).toBe(150)
})

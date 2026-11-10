import type { Page } from '@playwright/test'

import { expect } from './test'

type DomNode = { nodeId: number, attributes?: string[], children?: DomNode[], shadowRoots?: DomNode[], contentDocument?: DomNode }

/** Pauses inside a cue of the captions on screen, so the cue stays drawn. */
export const holdOnCue = (page: Page) => expect.poll(() => page.locator('video').evaluate((element) => {
  const video = element as HTMLVideoElement
  const cue = [...video.textTracks].find(track => track.mode === 'showing')?.cues?.[3]
  if (!cue) return false
  video.pause()
  video.currentTime = (cue.startTime + cue.endTime) / 2
  return true
}), { timeout: 60_000 }).toBe(true)

/**
 * Reads the drawn cue: its size against the browser's own default, that default, and its computed look. The cue lives
 * in the video's shadow tree, which only the DevTools protocol reaches.
 */
export const cueReader = async (page: Page) => {
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
      color: cueStyle('color'),
      background: cueStyle('background-color'),
      shadow: cueStyle('text-shadow'),
      family: cueStyle('font-family'),
    }
  }
}

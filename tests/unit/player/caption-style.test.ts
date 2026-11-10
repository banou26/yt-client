import { describe, expect, it } from 'vite-plus/test'

import { CAPTION_OPTIONS, captionDeclarations, stepCaptionSize } from '../../../src/player/caption-style'
import { DEFAULT_SETTINGS } from '../../../src/settings'

const declarations = (look: Partial<typeof DEFAULT_SETTINGS>, base = 16.5) =>
  Object.fromEntries(captionDeclarations({ ...DEFAULT_SETTINGS, ...look }, base).split('; ').map(line => line.split(/: (.*)/s).slice(0, 2)))

// each shadow's lengths, in px
const shadowLengths = (look: Partial<typeof DEFAULT_SETTINGS>, base: number) =>
  (declarations(look, base)['text-shadow'] as string).split(/, (?=rgba)/).map(shadow => [...shadow.matchAll(/(-?[\d.]+)px/g)].map(([, length]) => Number(length)))

describe('the Subtitles Options panel', () => {
  it('offers youtube.com\'s rows and choices, in its order (measured 2026-11-10)', () => {
    expect(CAPTION_OPTIONS.map(option => `${option.label}: ${option.choices.map(choice => choice.label).join(', ')}`)).toStrictEqual([
      'Font family: Monospaced Serif, Proportional Serif, Monospaced Sans-Serif, Proportional Sans-Serif, Casual, Cursive, Small Capitals',
      'Font color: White, Yellow, Green, Cyan, Blue, Magenta, Red, Black',
      'Font size: 50%, 75%, 100%, 150%, 200%, 300%, 400%',
      'Background color: White, Yellow, Green, Cyan, Blue, Magenta, Red, Black',
      'Background opacity: 0%, 25%, 50%, 75%, 100%',
      'Character edge style: None, Drop Shadow, Raised, Depressed, Outline',
      'Font opacity: 25%, 50%, 75%, 100%',
    ])
  })

  it('starts on youtube.com\'s defaults', () => {
    expect(CAPTION_OPTIONS.map(option => option.choices.find(choice => choice.value === DEFAULT_SETTINGS[option.key])?.label)).toStrictEqual([
      'Proportional Sans-Serif', 'White', '100%', 'Black', '75%', 'None', '100%',
    ])
  })
})

describe('the caption look', () => {
  it('draws youtube.com\'s default caption', () => {
    expect(declarations({})).toMatchObject({
      'font-size': '100%',
      'font-family': '"YouTube Noto", Roboto, Arial, Helvetica, Verdana, "PT Sans Caption", sans-serif',
      'color': 'rgba(255, 255, 255, 1)',
      'background-color': 'rgba(8, 8, 8, 0.75)',
      'text-shadow': 'none',
    })
  })

  it('draws each pick the way youtube.com does, the font opacity carrying to the edge', () => {
    expect(declarations({ captionColor: 'Yellow', captionOpacity: 0.5, captionBackground: 'Blue', captionBackgroundOpacity: 0.25, captionEdge: 'Depressed' })).toMatchObject({
      'color': 'rgba(255, 255, 0, 0.5)',
      'background-color': 'rgba(0, 0, 255, 0.25)',
      'text-shadow': 'rgba(204, 204, 204, 0.5) 1px 1px, rgba(34, 34, 34, 0.5) -1px -1px',
    })
    expect(declarations({ captionFont: 'Casual' })['font-family']).toBe('"Comic Sans MS", Impact, Handlee, fantasy')
    expect(declarations({ captionSize: 125 })['font-size']).toBe('125%')
  })
})

describe('the caption edges', () => {
  it('draw youtube.com\'s shadows on a 16.5 px base caption (measured 2026-11-10)', () => {
    expect(declarations({ captionEdge: 'Drop Shadow' })['text-shadow']).toBe(
      'rgba(34, 34, 34, 1) 1.03125px 1.03125px 1.546875px, rgba(34, 34, 34, 1) 1.03125px 1.03125px 2.0625px, rgba(34, 34, 34, 1) 1.03125px 1.03125px 2.578125px',
    )
    expect(declarations({ captionEdge: 'Raised' })['text-shadow']).toBe('rgba(34, 34, 34, 1) 1px 1px')
    expect(declarations({ captionEdge: 'Outline' })['text-shadow']).toBe(Array(5).fill('rgba(34, 34, 34, 1) 0 0 1.03125px').join(', '))
  })

  it('draw youtube.com\'s shadows on a 33.6 px base caption (measured 2026-11-10)', () => {
    const close = (lengths: number[][], expected: number[][]) => {
      expect(lengths.length).toBe(expected.length)
      lengths.forEach((shadow, index) => shadow.forEach((length, at) => expect(length).toBeCloseTo(expected[index]![at]!, 6)))
    }
    close(shadowLengths({ captionEdge: 'Drop Shadow' }, 33.6), [[2.1, 2.1, 3.15], [2.1, 2.1, 4.2], [2.1, 2.1, 5.25]])
    close(shadowLengths({ captionEdge: 'Raised' }, 33.6), [[1.05, 1.05], [2.05, 2.05], [3.05, 3.05]])
    close(shadowLengths({ captionEdge: 'Depressed' }, 33.6), [[1.05, 1.05], [-1.05, -1.05]])
    close(shadowLengths({ captionEdge: 'Outline' }, 33.6), Array(5).fill([2.1]))
  })

  it('follow the player\'s base caption size, not the size picked', () => {
    for (const captionEdge of ['Drop Shadow', 'Raised', 'Depressed', 'Outline']) {
      expect(declarations({ captionEdge, captionSize: 200 })['text-shadow']).toBe(declarations({ captionEdge, captionSize: 50 })['text-shadow'])
    }
  })
})

describe('the + and - caption size keys', () => {
  it('move two of the panel\'s sizes at a time and stop at either end, as on youtube.com', () => {
    expect(stepCaptionSize(100, 1)).toBe(150)
    expect(stepCaptionSize(75, 1)).toBe(125)
    expect(stepCaptionSize(175, 1)).toBe(200)
    expect(stepCaptionSize(175, -1)).toBe(125)
    expect(stepCaptionSize(75, -1)).toBe(50)
    expect(stepCaptionSize(50, -1)).toBe(50)
    expect(stepCaptionSize(200, 1)).toBe(200)
  })
})

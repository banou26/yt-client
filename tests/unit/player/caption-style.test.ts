import { describe, expect, it } from 'vite-plus/test'

import { CAPTION_OPTIONS, captionDeclarations, stepCaptionSize } from '../../../src/player/caption-style'
import { DEFAULT_SETTINGS } from '../../../src/settings'

const declarations = (look: Partial<typeof DEFAULT_SETTINGS>) =>
  Object.fromEntries(captionDeclarations({ ...DEFAULT_SETTINGS, ...look }).split('; ').map(line => line.split(/: (.*)/s).slice(0, 2)))

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
      'text-shadow': 'rgba(204, 204, 204, 0.5) 0.06em 0.06em, rgba(34, 34, 34, 0.5) -0.06em -0.06em',
    })
    expect(declarations({ captionFont: 'Casual' })['font-family']).toBe('"Comic Sans MS", Impact, Handlee, fantasy')
    expect(declarations({ captionSize: 125 })['font-size']).toBe('125%')
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

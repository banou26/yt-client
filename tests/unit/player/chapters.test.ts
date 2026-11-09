import { describe, expect, it } from 'vite-plus/test'

import { barFill, barOffset, barParts, barWidth, chapterIndexAt, chapterStep, timeAtOffset } from '../../../src/player/chapters'

// g6Die8gVFn0's six chapters, 779.111 s in all, as youtube.com draws them
const CHAPTERS = [0, 161.094, 347.18, 458.858, 578.544, 700.466].map((startSeconds, index) => ({ title: `Chapter ${index + 1}`, startSeconds }))
const DURATION = 779.111

describe('chapter steps', () => {
  it('finds the chapter a time falls in', () => {
    expect(chapterIndexAt(CHAPTERS, 0)).toBe(0)
    expect(chapterIndexAt(CHAPTERS, 400)).toBe(2)
    expect(chapterIndexAt(CHAPTERS, 458.858)).toBe(3)
    expect(chapterIndexAt([], 400)).toBe(-1)
  })

  it('moves to the start of the next chapter, and of the one before the chapter playing, as youtube.com does', () => {
    expect(chapterStep(CHAPTERS, 10, 1)).toBe(161.094)
    expect(chapterStep(CHAPTERS, 161.094, 1)).toBe(347.18)
    expect(chapterStep(CHAPTERS, 400, -1)).toBe(161.094)
    expect(chapterStep(CHAPTERS, 348, -1)).toBe(161.094)
  })

  it('does nothing past the last chapter, before the first, or without chapters', () => {
    expect(chapterStep(CHAPTERS, 760, 1)).toBeUndefined()
    expect(chapterStep(CHAPTERS, 5, -1)).toBeUndefined()
    expect(chapterStep([], 5, 1)).toBeUndefined()
  })
})

describe('the seek bar', () => {
  it('is one part per chapter, or one part for a video without chapters', () => {
    const parts = barParts(CHAPTERS, DURATION)
    expect(parts).toHaveLength(6)
    expect(parts[0]).toEqual({ start: 0, end: 161.094 })
    expect(parts[5]).toEqual({ start: 700.466, end: DURATION })
    expect(barParts([], DURATION)).toEqual([{ start: 0, end: DURATION }])
    expect(barWidth(barParts([], 0), 0, { start: 0, end: 0 })).toBe('100%')
  })

  it('places a time on its part, after the gaps before it, which a bar without chapters does not have', () => {
    const parts = barParts(CHAPTERS, DURATION)
    // the knob at 400 s sits two 4 px gaps along, less the share of all five gaps the parts before it gave up
    const share = 400 / DURATION
    expect(barOffset(parts, DURATION, 400)).toBe(`calc(${share * 100}% + ${(2 - share * 5) * 0.4}rem)`)
    expect(barOffset(barParts([], DURATION), DURATION, 400)).toBe(`calc(${share * 100}% + 0rem)`)
  })

  it('fills each part with the share of it the time has passed', () => {
    const [first, second] = barParts(CHAPTERS, DURATION)
    expect(barFill(first!, 400)).toBe('100%')
    expect(barFill(second!, 161.094 + (347.18 - 161.094) / 4)).toBe('25%')
    expect(barFill(second!, 10)).toBe('0%')
  })

  it('reads the time under the pointer within the part it is over, and a gap as the start of the part after it', () => {
    const parts = barParts(CHAPTERS, DURATION).slice(0, 2)
    const boxes = [{ left: 0, width: 100 }, { left: 104, width: 100 }]
    expect(timeAtOffset(parts, boxes, 50)).toBeCloseTo(161.094 / 2)
    expect(timeAtOffset(parts, boxes, 102)).toBe(161.094)
    expect(timeAtOffset(parts, boxes, 154)).toBeCloseTo(161.094 + (347.18 - 161.094) / 2)
    expect(timeAtOffset(parts, boxes, -5)).toBe(0)
  })
})

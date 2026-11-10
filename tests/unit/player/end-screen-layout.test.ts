import { describe, expect, it } from 'vite-plus/test'

import { parseEndScreen } from '../../../src/frame/end-screen'
import { placeElement, showsAt } from '../../../src/player/end-screen-layout'
import fixture from '../fixtures/end-screens.json'

const [channel, video] = parseEndScreen(fixture.g6Die8gVFn0)

describe('placeElement', () => {
  // youtube.com at 1280 px, on a picture of 880 by 440: the channel at 724,37 136x136 and the video at 20,232 284x160
  it('puts each element where youtube.com does, at whole pixels', () => {
    expect(placeElement(channel!, { width: 880, height: 440 })).toEqual({ left: 724, top: 37, width: 136, height: 136, radius: 8, opensLeft: true })
    expect(placeElement(video!, { width: 880, height: 440 })).toEqual({ left: 20, top: 232, width: 284, height: 160, radius: 12, opensLeft: false })
  })

  // in theater (1262 by 631) and in youtube.com's miniplayer (400 by 200)
  it('scales with the picture and rounds smaller tiles less', () => {
    expect(placeElement(channel!, { width: 1262, height: 631 })).toMatchObject({ left: 1038, top: 53, width: 195 })
    expect(placeElement(video!, { width: 400, height: 200 })).toMatchObject({ width: 129, height: 73, radius: 8 })
    expect(placeElement(channel!, { width: 400, height: 200 })).toMatchObject({ width: 62, radius: 4 })
  })

  // youtube.com on a picture of 900 by 450 draws the video 291x163: 290.53 px wide before rounding, so 163.42 px high
  it('takes the height from the width before rounding', () => {
    expect(placeElement(video!, { width: 900, height: 450 })).toMatchObject({ left: 21, top: 238, width: 291, height: 163 })
  })
})

describe('showsAt', () => {
  it('shows an element from its start until its end, or from the lead before its start', () => {
    expect(showsAt(channel!, 774_110, false)).toBe(false)
    expect(showsAt(channel!, 774_111, false)).toBe(true)
    expect(showsAt(channel!, 779_111, false)).toBe(false)
    expect(showsAt(channel!, 764_111, false, 10_000)).toBe(true)
  })

  it('shows none once the video has ended, even one whose end is past the video\'s', () => {
    const late = { ...channel!, endMs: 790_000 }
    expect(showsAt(late, 779_141, false)).toBe(true)
    expect(showsAt(late, 779_141, true)).toBe(false)
    expect(showsAt(late, 779_141, true, 10_000)).toBe(false)
  })
})

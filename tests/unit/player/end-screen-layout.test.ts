import { describe, expect, it } from 'vite-plus/test'

import { parseEndScreen } from '../../../src/frame/end-screen'
import { placeElement } from '../../../src/player/end-screen-layout'
import fixture from '../fixtures/end-screens.json'

describe('placeElement', () => {
  const [channel, video] = parseEndScreen(fixture.g6Die8gVFn0)

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
})

import { describe, expect, it } from 'vite-plus/test'

import { parseEndScreen } from '../../../src/frame/end-screen'
import fixture from '../fixtures/end-screens.json'

/* end-screens.json holds the fields parseEndScreen reads from the `endscreen` of youtube.com's signed-out player
   answers of 2026-11-10 */

describe('parseEndScreen', () => {
  it('reads a channel and two videos with where and when each shows', () => {
    const [channel, below, above] = parseEndScreen(fixture.g6Die8gVFn0)
    expect(channel).toEqual({
      kind: 'channel',
      left: 0.82280701,
      top: 0.08421053,
      width: 0.15438597,
      aspectRatio: 1,
      startMs: 774111,
      endMs: 779111,
      title: 'Marques Brownlee',
      image: expect.stringMatching(/^https:\/\/yt3\.ggpht\.com\/.+=s400-/),
      channelId: 'UCBJycsmduvYEL83R_U4JriQ',
      metadata: expect.stringMatching(/^MKBHD: Quality Tech Videos/),
      subscribed: false,
    })
    expect(below).toMatchObject({
      kind: 'video',
      left: 0.022807017,
      top: 0.52807015,
      aspectRatio: 1.7777778,
      title: 'Meta VR Glasses: What Vision Pro 2 COULD Have Been!',
      videoId: '_x58r9TBois',
      badge: '8:01',
      image: 'https://i.ytimg.com/vi/_x58r9TBois/maxresdefault.jpg',
    })
    expect(above).toMatchObject({ kind: 'video', top: 0.08421053, videoId: '2reQut8WNGc', badge: '10:54' })
  })

  it('opens a playlist at its first video in the list', () => {
    const playlist = parseEndScreen(fixture.dQw4w9WgXcQ).find(element => element.kind === 'playlist')
    expect(playlist).toMatchObject({
      title: 'Rick Astley: Official Music Videos',
      videoId: 'LLFhKaqnWwk',
      playlistId: 'PLlaN88a7y2_plecYoJxvRFTLHVbIVAOoc',
      badge: '43 videos',
      startMs: 201451,
      endMs: 212040,
    })
  })

  it('sends a website to its destination rather than through youtube.com', () => {
    const website = parseEndScreen(fixture['-UlxHPIEVqA']).find(element => element.kind === 'website')
    expect(website).toMatchObject({
      title: 'Patreon',
      url: 'https://www.patreon.com/domainofscience',
      metadata: 'patreon.com',
      action: 'Support',
      aspectRatio: 1,
    })
  })

  it('leaves out what it cannot place or open, and reads nothing from an answer without an end screen', () => {
    const element = fixture.g6Die8gVFn0.endscreen.endscreenRenderer.elements[1]!.endscreenElementRenderer
    const answer = (...nodes: object[]) => ({ endscreen: { endscreenRenderer: { elements: nodes.map(node => ({ endscreenElementRenderer: node })) } } })
    expect(parseEndScreen(answer(
      { ...element, style: 'MERCHANDISE' },
      { ...element, width: undefined },
      { ...element, endpoint: {} },
      { ...element, endMs: element.startMs },
    ))).toEqual([])
    expect(parseEndScreen({})).toEqual([])
    expect(parseEndScreen(undefined)).toEqual([])
  })
})

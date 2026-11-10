import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser } from 'youtubei.js'

import { normalizeWatchMeta } from '../../../../src/sources/youtube/normalize'
import fixture from '../../fixtures/info-cards.json'

/* info-cards.json holds youtube.com's signed-out /next answers of 2026-11-10, cut to their top-level cards and the
   expanded description's channel card with its info cards, stripped of tracking and playback fields and with the
   redirect tokens blanked: kJQP7kiw5Fk (three teasers, a link and two videos), dQw4w9WgXcQ (one teaser at the start, a
   link) and eyZEqSPeMwg (a channel). */

const metaOf = (next: unknown, id: string) =>
  normalizeWatchMeta({ ...Parser.parseResponse(next as never), contents_memo: new Map() }, id)

describe('the info card teasers', () => {
  it('reads each teaser with when it slides in and how long it stays', () => {
    expect(metaOf(fixture.kJQP7kiw5Fk, 'kJQP7kiw5Fk')?.cardTeasers).toEqual([
      { text: 'Listen to Luis\' new single', startMs: 15_000, durationMs: 6_000 },
      { text: 'Becky G - Glitch | Official Live Performance', startMs: 30_000, durationMs: 6_000 },
      { text: 'WATCH: New video by Luis Fonsi', startMs: 45_000, durationMs: 6_000 },
    ])
    expect(metaOf(fixture.dQw4w9WgXcQ, 'dQw4w9WgXcQ')?.cardTeasers).toEqual([
      { text: 'Rick Astley-Are We There Yet?', startMs: 1, durationMs: 6_000 },
    ])
  })

  it('is empty for a video without cards', () => {
    expect(metaOf({}, 'kJQP7kiw5Fk')?.cardTeasers).toEqual([])
  })
})

describe('the info cards under the channel card', () => {
  it('reads a link past youtube.com\'s redirect page, and videos with their byline and length', () => {
    const card = metaOf(fixture.kJQP7kiw5Fk, 'kJQP7kiw5Fk')?.channelCard
    expect(card?.avatar).toMatch(/^https:\/\/yt3\.ggpht\.com\/ia2BN5pg/)
    expect(card?.cards).toEqual([
      {
        title: 'Luis Fonsi - Por Isso Que Eu Bebo',
        subtitle: 'Listen Here',
        thumbnail: 'https://i.ytimg.com/an/kJQP7kiw5Fk/13702001461352292453_mq.jpg?v=6022aeef',
        url: 'https://luisfonsi.lnk.to/PorIssoQueEuBeboYC',
      },
      {
        title: 'Becky G - Glitch | Official Live Performance',
        subtitle: 'by BeckyGVEVO',
        thumbnail: expect.stringMatching(/^https:\/\/yt3\.ggpht\.com\/proxy\/.+=s224-w224-h128-nd$/),
        duration: '2:02',
        videoId: 'Clor87IPcBg',
      },
      {
        title: 'Luis Fonsi, Zé Neto & Cristiano, Thyy - Por Isso Que Eu Bebo',
        subtitle: 'by LuisFonsiVEVO',
        thumbnail: expect.stringMatching(/=s224-w224-h128-nd$/),
        duration: '2:57',
        videoId: 'z1Gr0fulmXk',
      },
    ])
  })

  it('reads a channel with its subscriber count', () => {
    expect(metaOf(fixture.eyZEqSPeMwg, 'eyZEqSPeMwg')?.channelCard?.cards).toEqual([{
      title: 'InGenius',
      subtitle: '144K subscribers',
      thumbnail: expect.stringMatching(/^https:\/\/yt3\.ggpht\.com\/.+=s128-c-k-c0x00ffffff-no-rj$/),
      channelId: 'UC1UmujXTizWokDHojdEOdow',
    }])
    expect(metaOf(fixture.dQw4w9WgXcQ, 'dQw4w9WgXcQ')?.channelCard?.cards.map(card => card.url)).toEqual([
      'https://rickastley.lnk.to/AreWeThereYetFA/itunes',
    ])
  })
})

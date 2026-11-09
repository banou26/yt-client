import { describe, expect, it } from 'vite-plus/test'

import { embedCode, watchLink } from '../../../src/player/links'

const ORIGIN = 'https://youtube.fkn.app'

describe("the player menu's copied links", () => {
  it("take youtube.com's video link and its playlist to this app's /watch page", () => {
    expect(watchLink(ORIGIN, 'jNQXAC9IVRw')).toBe(`${ORIGIN}/watch?v=jNQXAC9IVRw`)
    expect(watchLink(ORIGIN, 'dQw4w9WgXcQ', { list: 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI' }))
      .toBe(`${ORIGIN}/watch?v=dQw4w9WgXcQ&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI`)
  })

  it('floor the current time to whole seconds, and leave it out under one second as youtube.com does', () => {
    expect(watchLink(ORIGIN, 'jNQXAC9IVRw', { t: 7.6 })).toBe(`${ORIGIN}/watch?v=jNQXAC9IVRw&t=7`)
    expect(watchLink(ORIGIN, 'dQw4w9WgXcQ', { list: 'PL1', t: 14.2 })).toBe(`${ORIGIN}/watch?v=dQw4w9WgXcQ&list=PL1&t=14`)
    expect(watchLink(ORIGIN, 'dQw4w9WgXcQ', { t: 0.4 })).toBe(`${ORIGIN}/watch?v=dQw4w9WgXcQ`)
  })
})

describe("the player menu's embed code", () => {
  it("is youtube.com's own, at the player's size, with the title escaped for its attribute", () => {
    expect(embedCode({ videoId: 't0Q2otsqC4I', title: 'Tom & Jerry in "Full" Screen', width: 829.6, height: 466.6 })).toBe(
      '<iframe width="830" height="467" src="https://www.youtube.com/embed/t0Q2otsqC4I" title="Tom &amp; Jerry in &quot;Full&quot; Screen"'
      + ' frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"'
      + ' referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>',
    )
  })

  it('leaves the title out while it is not known', () => {
    expect(embedCode({ videoId: 'jNQXAC9IVRw', width: 880, height: 495 })).not.toContain('title=')
  })
})

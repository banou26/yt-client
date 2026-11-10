import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser, YT } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import fixture from '../../fixtures/posts-tab-mkbhd.json'

/* posts-tab-mkbhd.json is the signed-out browse of youtube.com/@mkbhd/posts captured on 2026-11-10 (English, United
   States), stripped of the header, the other tabs, tracking fields and redirect tokens, and cut to two of its eight
   posts: the first (long, with an image) and the fifth (a video). It runs through the real upstream parser. */

const MKBHD = 'UCBJycsmduvYEL83R_U4JriQ'

const source = createYoutubeSource({
  fetch: globalThis.fetch,
  createClient: async () => ({
    getChannel: async () => new YT.Channel(undefined as never, Parser.parseResponse(fixture as never), true),
  }) as never,
})

describe('a channel\'s Posts tab', () => {
  it('reads each post\'s comment count beside its likes, as its footer shows them', async () => {
    const page = await source.communityPosts(MKBHD)
    expect(page.items.map(({ id, voteCountText, commentCountText }) => ({ id, voteCountText, commentCountText }))).toEqual([
      { id: 'UgkxX6gkDxQ0KRucvyG7NLui0LhjHp0CLlfZ', voteCountText: '12K', commentCountText: '1K' },
      { id: 'UgkxWw9Nf4Kb453wM6hA2d9pySxjBixo0fXT', voteCountText: '2.5K', commentCountText: '30' },
    ])
  })
})

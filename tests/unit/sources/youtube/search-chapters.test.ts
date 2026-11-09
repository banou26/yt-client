import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser, YT } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import fixture from '../../fixtures/search-chapters.json'

/* search-chapters.json is the signed-out search for "how to replace moen 1225 cartridge kitchen faucet dripping"
   captured on 2026-11-10, cut to two rows and stripped of tracking and playback fields: C3zuzzDLLck lists its three
   chapters under the description, and dgavC1xqb0s has an AI summary in the same strip. */

const search = async () => {
  const source = createYoutubeSource({
    fetch: globalThis.fetch,
    createClient: async () => ({
      search: async () => new YT.Search(undefined as never, Parser.parseResponse(fixture as never), true),
    }) as never,
  })
  return (await source.search('moen 1225')).results
}

const row = async (id: string) => {
  const found = (await search()).find(result => result.kind === 'video' && result.id === id)
  if (found?.kind !== 'video') throw new Error(`no row for ${id}`)
  return found
}

describe('search row chapters', () => {
  it('reads the chapters a row lists, with their start, still and heading, and none off a summary', async () => {
    const video = await row('C3zuzzDLLck')
    expect(video.chapters?.map(({ title, startSeconds }) => ({ title, startSeconds }))).toEqual([
      { title: 'Intro', startSeconds: 0 },
      { title: 'Disassembly', startSeconds: 50 },
      { title: 'Cartridge Replacement', startSeconds: 140 },
    ])
    expect(video.chapters?.every(chapter => chapter.thumbnail?.startsWith('https://i.ytimg.com/vi/C3zuzzDLLck/'))).toBe(true)
    expect(video.chaptersTitle).toBe('3 auto-generated chapters in this video')

    const summarized = await row('dgavC1xqb0s')
    expect(summarized.chapters, 'a summary is not chapters').toBeUndefined()
    expect(summarized.chaptersTitle).toBeUndefined()
  })
})

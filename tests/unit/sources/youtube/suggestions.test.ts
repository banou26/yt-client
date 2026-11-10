/// <reference types="vite/client" />
import { describe, expect, it } from 'vite-plus/test'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import mrbeas from '../../fixtures/suggestions-mrbeas.txt?raw'
import taylor from '../../fixtures/suggestions-taylor-s.txt?raw'

// the charset an answer names follows `hl`: ISO-8859-1 for `en`, Shift_JIS for `ja` (measured 2026-11-10)
const LATIN_1 = 'text/javascript; charset=ISO-8859-1'

const latin1 = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0))

const sourceAnswering = (body: string | TypeError) => {
  const asked: string[] = []
  const source = createYoutubeSource({
    fetch: async (input) => {
      asked.push(input instanceof Request ? input.url : input.toString())
      if (body instanceof TypeError) throw body
      return new Response(latin1(body), { headers: { 'content-type': LATIN_1 } })
    },
    createClient: async () => ({ session: { logged_in: false, context: { client: { hl: 'en', gl: 'US' } } } }) as never,
  })
  return { source, asked }
}

describe('search suggestions', () => {
  it('keep the person or thing upstream ties a suggestion to, with what it is and its photo', async () => {
    const { source, asked } = sourceAnswering(taylor)
    expect(await source.searchSuggestions('taylor s')).toEqual([
      {
        query: 'taylor swift',
        name: 'Taylor Swift',
        description: 'American singer-songwriter',
        photo: 'https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcT3ZtVoa8vWJOnrzCf9BspNPA-bWFOJ3aXHHTXxPFevhGCNPVkm',
      },
      { query: 'taylor swift songs' },
      { query: 'taylor swift patient zero' },
      { query: 'taylor swift wedding' },
    ])
    const url = new URL(asked[0]!)
    expect(`${url.origin}${url.pathname}`).toBe('https://suggestqueries-clients6.youtube.com/complete/search')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client: 'youtube', ds: 'yt', hl: 'en', gl: 'US', q: 'taylor s' })
  })

  it('mark a suggestion tied to a channel with its id', async () => {
    const [channel, plain] = await sourceAnswering(mrbeas).source.searchSuggestions('mrbeas')
    expect(channel).toEqual({
      query: 'mrbeast',
      name: 'MrBeast',
      description: '@MrBeast',
      photo: 'https://yt3.googleusercontent.com/nxYrc_1_2f77DoBadyxMTmv7ZpRZapHR5jbuYe7PlPd5cIRJxtNNEYyOC0ZsxaDyJJzXrnJiuDE=s88-c-k-c0x00ffffff-no-rj',
      channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA',
    })
    expect(plain).toEqual({ query: 'mrbeast grocery store' })
  })

  it('read an answer in the charset it names', async () => {
    const { source } = sourceAnswering('window.google.ac.h(["beyonc",[["beyoncé",0,[512]]],{"j":"0","k":1}])')
    expect(await source.searchSuggestions('beyonc')).toEqual([{ query: 'beyoncé' }])
  })

  it('degrade to an empty list rather than failing the header', async () => {
    expect(await sourceAnswering(taylor).source.searchSuggestions('   ')).toEqual([])
    expect(await sourceAnswering('<!doctype html><title>Error</title>').source.searchSuggestions('taylor s')).toEqual([])
    expect(await sourceAnswering(new TypeError('Failed to fetch')).source.searchSuggestions('taylor s')).toEqual([])
  })
})

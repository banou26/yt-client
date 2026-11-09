import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import fixture from '../../fixtures/post-mkbhd.json'

/* post-mkbhd.json is the signed-out browse youtube.com/post/UgkxX6gkDxQ0KRucvyG7NLui0LhjHp0CLlfZ resolves to, captured on
   2026-11-10 (English, United States): an MKBHD post with an image, cut before its comments and stripped of tracking
   fields and redirect tokens. RESOLVED is what resolve_url answered for that address: the browse carries the channel. */

const POST = 'UgkxX6gkDxQ0KRucvyG7NLui0LhjHp0CLlfZ'
const RESOLVED = {
  browseId: 'FEpost_detail',
  params: 'wgNaEhhVQ0JKeWNzbWR1dllFTDgzUl9VNEpyaVEaJFVna3hYNmdrRHhRMEtSdWN2eUc3Tkx1aTBMaGpIcDBDTGxmWloYVUNCSnljc21kdXZZRUw4M1JfVTRKcmlR',
}

const sourceFor = (resolveURL: (url: string) => Promise<unknown>) => {
  const sent: unknown[] = []
  const source = createYoutubeSource({
    fetch: globalThis.fetch,
    createClient: async () => ({
      resolveURL: async (url: string) => {
        sent.push(url)
        return resolveURL(url)
      },
      actions: {
        execute: async (endpoint: string, args: unknown) => {
          sent.push({ endpoint, args })
          return Parser.parseResponse(fixture as never)
        },
      },
    }) as never,
  })
  return { source, sent }
}

const notFound = () => new Error('Request to https://www.youtube.com/youtubei/v1/navigation/resolve_url?prettyPrint=false&alt=json failed with status code 404')

describe('a post by its id', () => {
  it('opens through the address youtube.com resolves it with', async () => {
    const { source, sent } = sourceFor(async () => ({ payload: RESOLVED }))
    const post = await source.post(POST)
    expect(sent).toEqual([
      `https://www.youtube.com/post/${POST}`,
      { endpoint: '/browse', args: { ...RESOLVED, parse: true } },
    ])
    expect(post).toMatchObject({
      id: POST,
      author: { id: 'UCBJycsmduvYEL83R_U4JriQ', name: 'Marques Brownlee' },
      publishedText: '2 years ago (edited)',
      voteCountText: '12K',
      attachedImage: expect.stringContaining('yt3.ggpht.com/'),
    })
    expect(post?.text).toMatch(/^Alright, it's that time: https:\/\/vote\.mkbhd\.com\n\nWelcome to the Blind Smartphone Camera Test 2023!/)
  })

  it('is absent when youtube.com has no post under the id', async () => {
    const { source, sent } = sourceFor(async () => { throw notFound() })
    await expect(source.post('UgkxNOPE')).resolves.toBeUndefined()
    expect(sent).toHaveLength(1)
  })

  it('fails when the address does not resolve for another reason', async () => {
    const { source } = sourceFor(async () => { throw new Error('Request failed with status code 500') })
    await expect(source.post(POST)).rejects.toThrow('status code 500')
  })
})

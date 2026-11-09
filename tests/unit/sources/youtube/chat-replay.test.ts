import { describe, expect, it } from 'vite-plus/test'

import { Parser } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import fixture from '../../fixtures/chat-replay-premiere.json'

/* chat-replay-premiere.json is the signed-out chat replay of the premiere fOT0BUpITw8 captured on 2026-11-10: /next's
   conversation bar, the first page asked at 3:00 (the opening notice at 0:00, then lines from 2:54), the page after it,
   and the page past the end of the video, which names no next page. Every author, avatar, id and message is replaced by
   a generic one, the tokens by names, and the offsets and timestamps are the recorded ones. */

const VIDEO = 'fOT0BUpITw8'

type Ask = { endpoint: string, continuation?: string, offset?: string }

const sourceFor = ({ replay = true } = {}) => {
  const asked: Ask[] = []
  const pages: Record<string, unknown> = {
    'replay-open': fixture.first,
    'view-top': fixture.first,
    'view-all': fixture.first,
    'replay-more': fixture.more,
    'replay-last': fixture.end,
  }
  const execute = async (endpoint: string, args: { continuation?: string, currentPlayerState?: { playerOffsetMs?: string } }) => {
    asked.push({ endpoint, continuation: args.continuation, offset: args.currentPlayerState?.playerOffsetMs })
    if (endpoint === '/next') return Parser.parseResponse((replay ? fixture.next : { contents: { twoColumnWatchNextResults: {} } }) as never)
    return Parser.parseResponse(pages[args.continuation ?? ''] as never)
  }
  const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => ({ actions: { execute } }) as never })
  return { source, asked }
}

describe('chat replay', () => {
  it('pages a recorded premiere replay by the point each line was said at', async () => {
    const { source, asked } = sourceFor()

    expect((await source.watch(VIDEO))?.hasChatReplay).toBe(true)
    const first = await source.liveChatReplay(VIDEO, 180_000)
    // the opening notice and the placeholder carry no author, so only the five lines are kept
    expect(first.items.map(({ id, text, offsetMs, timestampText, author }) => ({ id, text, offsetMs, timestampText, author: author?.name }))).toEqual([
      { id: 'replay-message-1', text: 'message 1', offsetMs: 174_274, timestampText: '2:54', author: '@viewer1' },
      { id: 'replay-message-2', text: 'message 2', offsetMs: 174_602, timestampText: '2:54', author: '@viewer2' },
      { id: 'replay-message-3', text: 'message 3', offsetMs: 174_625, timestampText: '2:54', author: '@viewer3' },
      { id: 'replay-message-4', text: 'message 4', offsetMs: 174_913, timestampText: '2:54', author: '@viewer4' },
      { id: 'replay-message-5', text: 'message 5', offsetMs: 175_348, timestampText: '2:55', author: '@viewer5' },
    ])
    expect(first.items[0]?.author?.avatar).toContain('viewer1')
    expect(first.cursor).toBeDefined()

    const more = await source.liveChatReplay(VIDEO, 185_000, 'TOP', first.cursor)
    expect(more.items.map((item) => [item.text, item.offsetMs])).toEqual([
      ['message 6', 185_070],
      ['message 7', 185_148],
      ['message 8', 185_609],
    ])
    const last = await source.liveChatReplay(VIDEO, 190_000, 'TOP', more.cursor)
    expect(last).toEqual({ items: [] })

    // a seek starts again from the token the first page's header named for its view, at the new point
    await source.liveChatReplay(VIDEO, 30_000)
    await source.liveChatReplay(VIDEO, 30_000, 'ALL')
    expect(asked).toEqual([
      { endpoint: '/next', continuation: undefined, offset: undefined },
      { endpoint: 'live_chat/get_live_chat_replay', continuation: 'replay-open', offset: '180000' },
      { endpoint: 'live_chat/get_live_chat_replay', continuation: 'replay-more', offset: '175348' },
      { endpoint: 'live_chat/get_live_chat_replay', continuation: 'replay-last', offset: '185609' },
      { endpoint: 'live_chat/get_live_chat_replay', continuation: 'view-top', offset: '30000' },
      { endpoint: 'live_chat/get_live_chat_replay', continuation: 'view-all', offset: '30000' },
    ])
  })

  it('finds the replay through /next when the watch page was read by an engine a reset replaced', async () => {
    const { source, asked } = sourceFor()
    const page = await source.liveChatReplay(VIDEO, 180_000, 'ALL')
    expect(page.items).toHaveLength(5)
    expect(asked.map((ask) => ask.continuation ?? ask.endpoint)).toEqual(['/next', 'replay-open', 'view-all'])
  })

  it('has no replay on a video whose /next names none', async () => {
    const { source } = sourceFor({ replay: false })
    expect((await source.watch(VIDEO))?.hasChatReplay).toBe(false)
    await expect(source.liveChatReplay(VIDEO, 0)).resolves.toEqual({ items: [], disabled: true })
  })
})

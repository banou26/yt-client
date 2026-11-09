import { describe, expect, it, vi } from 'vite-plus/test'

import { gql } from '@urql/core'

import { client } from '../../src/graphql'

// urql's own entry loads React, which only the app's build aliases to preact; the client needs no hook
vi.mock('urql', () => import('@urql/core'))
const upstream = vi.hoisted(() => ({ answer: undefined as unknown }))
vi.mock('../../src/worker', () => ({
  handleRequest: async () => new Response(JSON.stringify({ data: upstream.answer }), { headers: { 'content-type': 'application/json' } }),
}))

const CHAT = gql`
  query Chat {
    liveChatReplay(videoId: "video-1", offsetMs: 0) {
      items { id text runs { text emojiUrl } author { id name } offsetMs }
      cursor
    }
  }
`

const WATCH = gql`
  query Watch {
    watch(id: "video-1") { id descriptionRuns { text url } }
  }
`

const CONTROL = gql`
  query Control {
    control { label }
  }
`

describe('the graphcache keys', () => {
  it('embeds chat pages, chat runs and text runs without a missing-key warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    upstream.answer = {
      liveChatReplay: {
        __typename: 'LiveChatPage',
        items: [{
          __typename: 'LiveChatMessage',
          id: 'line-1',
          text: 'message 1',
          runs: [{ __typename: 'LiveChatRun', text: 'message 1', emojiUrl: null }],
          author: { __typename: 'Channel', id: 'UCviewer1', name: '@viewer1' },
          offsetMs: 1_000,
        }],
        cursor: null,
      },
    }
    const chat = await client.query(CHAT, {}).toPromise()
    expect(chat.data?.liveChatReplay.items[0].runs[0].text).toBe('message 1')

    upstream.answer = { watch: { __typename: 'WatchMeta', id: 'video-1', descriptionRuns: [{ __typename: 'TextRun', text: 'a description', url: null }] } }
    const watch = await client.query(WATCH, {}).toPromise()
    expect(watch.data?.watch.descriptionRuns[0].text).toBe('a description')

    // a type with no keys entry, so a run that cannot see the warning fails here rather than passing
    upstream.answer = { control: { __typename: 'Unkeyed', label: 'control' } }
    await client.query(CONTROL, {}).toPromise()

    // graphcache names the type in its warning when a selection set has no key and no keys entry
    const missing = warn.mock.calls.map(([message]) => /keys` config for `(\w+)`/.exec(String(message))?.[1])
    expect(missing.filter(Boolean)).toEqual(['Unkeyed'])
    warn.mockRestore()
  })
})

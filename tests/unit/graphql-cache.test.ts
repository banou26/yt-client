import { describe, expect, it, vi } from 'vite-plus/test'

import type { SourceApi } from '../../src/sources/types'

import { Client, fetchExchange, gql } from '@urql/core'
import { createSchema, createYoga } from 'graphql-yoga'

import { client, createCache } from '../../src/graphql'
import { resolvers } from '../../src/worker/resolvers'
import typeDefs from '../../src/worker/schema.gql?raw'

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
          author: { __typename: 'Author', id: 'UCviewer1', name: '@viewer1' },
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

const MKBHD = 'UCBJycsmduvYEL83R_U4JriQ'

// the __typename of an author comes from the schema, so the answers go through the app's own schema and resolvers
const clientOf = (source: Partial<SourceApi>) => {
  const yoga = createYoga<{ source: Partial<SourceApi> }>({ maskedErrors: false, schema: createSchema({ typeDefs, resolvers }) })
  return new Client({
    url: 'http://graphql-cache.local/graphql',
    exchanges: [createCache(), fetchExchange],
    fetch: async (input, init) => yoga.handleRequest(new Request(input, init), { source }),
  })
}

const COLLABORATORS = gql`
  query Collaborators {
    watch(id: "e3fz3dqhN44") { id collaborators { id name handle avatar } }
  }
`

const COMMENT_AUTHORS = gql`
  query CommentAuthors {
    comments(videoId: "e3fz3dqhN44") { items { id text author { id name avatar isVerified } } cursor }
  }
`

const CHAT_AUTHORS = gql`
  query ChatAuthors {
    liveChatReplay(videoId: "e3fz3dqhN44", offsetMs: 0) { items { id text author { id name avatar isVerified } } cursor }
  }
`

const collaborators = [{ id: MKBHD, name: 'Marques Brownlee', handle: '@mkbhd', avatar: 'channel.jpg' }]
const watch = async () => ({ id: 'e3fz3dqhN44', related: [], collaborators }) as never

// youtube.com names a comment's or a chat line's author by @handle, and the author's id is their channel's
const byline = { id: MKBHD, name: '@mkbhd', avatar: 'author.jpg', isVerified: true }

describe('an author', () => {
  it('leaves the name of the channel that wrote a comment as it was', async () => {
    const cached = clientOf({
      watch,
      comments: async () => ({ items: [{ id: 'comment-1', text: 'a comment', runs: [], author: byline }] }),
    })
    await cached.query(COLLABORATORS, {}).toPromise()
    const comments = await cached.query(COMMENT_AUTHORS, {}).toPromise()
    expect(comments.error).toBeUndefined()
    expect(comments.data?.comments.items[0].author).toEqual(byline)

    const after = await cached.query(COLLABORATORS, {}, { requestPolicy: 'cache-only' }).toPromise()
    expect(after.data?.watch.collaborators).toEqual(collaborators)
  })

  it('leaves the name of the channel that wrote a chat line as it was', async () => {
    const cached = clientOf({
      watch,
      liveChatReplay: async () => ({ items: [{ id: 'line-1', text: 'a line', runs: [], author: byline, offsetMs: 0 }] }),
    })
    await cached.query(COLLABORATORS, {}).toPromise()
    const chat = await cached.query(CHAT_AUTHORS, {}).toPromise()
    expect(chat.error).toBeUndefined()
    expect(chat.data?.liveChatReplay.items[0].author).toMatchObject(byline)

    const after = await cached.query(COLLABORATORS, {}, { requestPolicy: 'cache-only' }).toPromise()
    expect(after.data?.watch.collaborators).toEqual(collaborators)
  })
})

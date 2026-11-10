import { describe, expect, it } from 'vite-plus/test'

import { Parser, YT, YTNodes } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import { CHANNEL_NOT_FOUND, CHANNEL_UNAVAILABLE, SOURCE_CURSOR_ARGUMENT, SOURCE_REPLAY } from '../../../../src/sources/types'
import { accountsListAnswer, BRAND_PAGE_ID, twoChannels } from '../../fixtures/accounts-list'

type FakeFeed = {
  videos: { video_id: string, title: { text: string } }[]
  memo: Map<string, unknown[]>
  has_continuation: boolean
  getContinuation(): Promise<FakeFeed>
}

type FakeSearch = {
  videos: unknown[]
  results: unknown[]
  refinements: string[]
  estimated_results: number
  has_continuation: boolean
  getContinuation(): Promise<FakeSearch>
}

type FakeCommand = { call(actions: unknown, args?: Record<string, unknown>): Promise<unknown> }

type FakeComments = {
  contents: {
    comment: {
      comment_id: string
      content: { text: string }
      like_command?: FakeCommand
      dislike_command?: FakeCommand
      unlike_command?: FakeCommand
      reply_command?: { dialog?: { reply_button?: { endpoint?: FakeCommand } } }
    }
  }[]
  header?: { count?: { text: string }, comments_count?: { text: string } }
  has_continuation: boolean
  getContinuation(): Promise<FakeComments>
}

type FakePlaylist = {
  info: { title: string, total_items: string }
  memo: Map<string, unknown[]>
  has_continuation: boolean
  getContinuation(): Promise<FakePlaylist>
}

type FakePlaylists = {
  playlists: unknown[]
  has_continuation: boolean
  getContinuation(): Promise<FakePlaylists>
}

const feed = (id: string, next?: () => Promise<FakeFeed>): FakeFeed => ({
  videos: [{ video_id: id, title: { text: id } }],
  memo: new Map<string, unknown[]>([['ShortsLockupView', [
    { on_tap_endpoint: { payload: { videoId: `short-${id}` } }, overlay_metadata: { primary_text: { text: `Short ${id}` } } },
  ]]]),
  has_continuation: Boolean(next),
  getContinuation: next ?? (() => Promise.reject(new Error('no continuation'))),
})

const search = (id: string, next?: () => Promise<FakeSearch>): FakeSearch => ({
  videos: [],
  results: [
    { video_id: id, title: { text: id } },
    { id: 'UCchannel', author: { id: 'UCchannel', name: 'A Channel' }, subscriber_count: { text: '1M subscribers' } },
  ],
  refinements: ['refined query'],
  estimated_results: 1234,
  has_continuation: Boolean(next),
  getContinuation: next ?? (() => Promise.reject(new Error('no continuation'))),
})

const commentCalls: string[] = []

const commandFor = (id: string, name: string) => ({
  call: async (_actions: unknown, args?: Record<string, unknown>) => {
    commentCalls.push(args ? `${name}:${id}:${JSON.stringify(args)}` : `${name}:${id}`)
    return {}
  },
})

const comments = (id: string, next?: () => Promise<FakeComments>): FakeComments => ({
  contents: [{
    comment: {
      comment_id: id,
      content: { text: id },
      like_command: commandFor(id, 'like'),
      dislike_command: commandFor(id, 'dislike'),
      unlike_command: commandFor(id, 'unlike'),
      reply_command: { dialog: { reply_button: { endpoint: commandFor(id, 'reply') } } },
    },
  }],
  has_continuation: Boolean(next),
  getContinuation: next ?? (() => Promise.reject(new Error('no continuation'))),
})

// The playlist rows live in the memo rather than behind the `items` getter, which throws on any node outside its union
const playlist = (id: string, next?: () => Promise<FakePlaylist>): FakePlaylist => ({
  info: { title: 'My playlist', total_items: '2 videos' },
  memo: new Map<string, unknown[]>([['PlaylistVideo', [
    { id, title: { text: id }, index: { text: '1' }, set_video_id: `set-${id}` },
  ]]]),
  has_continuation: Boolean(next),
  getContinuation: next ?? (() => Promise.reject(new Error('no continuation'))),
})

const playlists = (id: string, next?: () => Promise<FakePlaylists>): FakePlaylists => ({
  playlists: [{ id, title: { text: id }, video_count: { text: '3 videos' } }],
  has_continuation: Boolean(next),
  getContinuation: next ?? (() => Promise.reject(new Error('no continuation'))),
})

type FakePosts = {
  videos: unknown[]
  posts: unknown[]
  has_continuation: boolean
  getContinuation(): Promise<FakePosts>
}

const posts = (id: string, next?: () => Promise<FakePosts>): FakePosts => ({
  videos: [],
  posts: [{ id, content: { text: `Body of ${id}` }, published: { text: '2 days ago' }, author: { id: 'UC1', name: 'Chan' } }],
  has_continuation: Boolean(next),
  getContinuation: next ?? (() => Promise.reject(new Error('no continuation'))),
})

type FakeNotifications = {
  contents: unknown[]
  getContinuation(): Promise<FakeNotifications>
}

const notifications = (id: string, next?: () => Promise<FakeNotifications>): FakeNotifications => ({
  contents: [{
    notification_id: id,
    short_message: { text: `Message ${id}` },
    sent_time: { text: '1 hour ago' },
    thumbnails: [{ url: 'avatar', width: 48 }],
    video_thumbnails: [{ url: 'still', width: 320 }],
    endpoint: { payload: { videoId: `v-${id}` } },
    record_click_endpoint: commandFor(id, 'recordClick'),
    read: false,
  }],
  getContinuation: next ?? (() => Promise.reject(new Error('no continuation'))),
})

type FakeCall = { endpoint: string, args?: Record<string, unknown> }

const createFakeClient = () => {
  const calls: string[] = []
  type ChatListener = (action: { item?: unknown, target_item_id?: string }) => void
  const chatListeners: ChatListener[] = []
  const chatEnders: (() => void)[] = []
  const liveChat = {
    on: (event: string, listener: (value: never) => void) => {
      if (event === 'chat-update') chatListeners.push(listener as ChatListener)
      if (event === 'end') chatEnders.push(listener as () => void)
    },
    start: () => void calls.push('livechat:start'),
    stop: () => void calls.push('livechat:stop'),
    sendMessage: async (body: string) => void calls.push(`livechat:send:${body}`),
  }
  const emitChat = (action: { item?: unknown, target_item_id?: string }) => {
    for (const listener of chatListeners) listener(action)
  }
  const endChat = () => {
    for (const ender of chatEnders) ender()
  }
  const payloads: FakeCall[] = []
  const searchFilters: unknown[] = []
  return {
    calls,
    emitChat,
    endChat,
    payloads,
    searchFilters,
    getHomeFeed: async () => feed('first', async () => feed('second')),
    search: async (_query: string, filters?: unknown) => {
      searchFilters.push(filters)
      return search('search', async () => search('search-2'))
    },
    getBasicInfo: async () => ({ basic_info: undefined }),
    // getWatchNextContinuation MUTATES this object and returns `this` rather than handing back a fresh page
    getShortsVideoInfo: async (id: string) => {
      const entry = (video: string, title?: string) => ({
        payload: {
          videoId: video,
          thumbnail: { thumbnails: [{ url: `${video}-sd.jpg`, width: 480, height: 854 }, { url: `${video}.jpg`, width: 1080, height: 1920 }] },
          ...(title ? { unserializedPrefetchData: { playerResponse: { videoDetails: { title } } } } : {}),
        },
      })
      let page = 0
      const sequence = {
        basic_info: { id, title: `Seed ${id}`, thumbnail: [{ url: 'seed-sd.jpg', width: 320 }, { url: 'seed.jpg', width: 1080 }] },
        watch_next_feed: [entry('reel-1', 'Prefetched title'), entry('reel-2')],
        wn_has_continuation: true,
        getWatchNextContinuation: async () => {
          page += 1
          sequence.watch_next_feed = [entry(`reel-page-${page}`)]
          sequence.wn_has_continuation = page < 2
          return sequence
        },
      }
      return sequence
    },
    getChannel: async () => {
      // Real methods rather than arrows: every upstream tab opener is a prototype method that reaches for `this.getTabByURL`
      const channel = {
        ...feed('channel'),
        metadata: { external_id: 'c', title: 'Channel' },
        has_videos: true,
        has_playlists: true,
        has_community: true,
        has_about: true,
        async getVideos(this: unknown) {
          if (this !== channel) throw new TypeError("Cannot read properties of undefined (reading 'getTabByURL')")
          return feed('channel-videos', async () => feed('channel-videos-2'))
        },
        async getPlaylists(this: unknown) {
          if (this !== channel) throw new TypeError("Cannot read properties of undefined (reading 'getTabByURL')")
          return feed('channel-playlists', async () => feed('channel-playlists-2'))
        },
        async getCommunity(this: unknown) {
          if (this !== channel) throw new TypeError("Cannot read properties of undefined (reading 'getTabByURL')")
          return posts('post-1', async () => posts('post-2'))
        },
        async getAbout(this: unknown) {
          if (this !== channel) throw new TypeError("Cannot read properties of undefined (reading 'getTabByURL')")
          return { metadata: { description: 'About us', country: 'Norway', view_count: '1,234 views', links: [{ title: { text: 'Site' }, link: { text: 'example.com' } }] } }
        },
      }
      return channel
    },
    getComments: async () => ({
      ...comments('top', async () => comments('next')),
      header: { count: { text: '2,461,151 Comments' }, comments_count: { text: '2.4M' } },
    }),
    getPostComments: async (postId: string, channelId: string, sortBy?: string) => {
      calls.push(`getPostComments:${postId}:${channelId}:${sortBy}`)
      return {
        ...comments(`${postId}-top`, async () => comments(`${postId}-next`)),
        header: { count: { text: '1,045 Comments' }, comments_count: { text: '1K' } },
      }
    },
    resolveURL: async (url: string) => {
      calls.push(`resolveURL:${url}`)
      return { payload: { browseId: 'UCresolved' } }
    },
    getInfo: async (id: string) => {
      calls.push(`getInfo:${id}`)
      if (id === 'nochat') return { livechat: undefined, getLiveChat: () => { throw new Error('Live Chat is not available') } }
      return {
        livechat: {},
        getLiveChat: () => liveChat,
      }
    },
    getPlaylists: async () => playlists('PLone', async () => playlists('PLtwo')),
    getNotifications: async () => notifications('n1', async () => notifications('n2')),
    getUnseenNotificationsCount: async () => 3,
    getPlaylist: async (id: string) => playlist(`${id}-first`, async () => playlist(`${id}-second`)),
    getSubscriptionsFeed: async () => feed('sub'),
    getHistory: async () => ({
      ...feed('watched'),
      sections: [
        { header: { title: 'Today' }, contents: [{ video_id: 'today', title: { text: 'Today video' } }] },
        { header: { title: 'Yesterday' }, contents: [{ video_id: 'older', title: { text: 'Older video' } }] },
      ],
      removeVideo: async (videoId: string, _pagesToLoad?: number): Promise<boolean | undefined> => void calls.push(`removeHistory:${videoId}`),
    }),
    getChannelsFeed: async () => ({
      channels: [{ author: { id: 'UC1', name: 'Chan', thumbnails: [{ url: 'a' }] } }],
    }),
    session: { logged_in: true, context: { client: { hl: 'en', gl: 'US' } } },
    interact: {
      comment: async (videoId: string, body: string) => void calls.push(`comment:${videoId}:${body}`),
      subscribe: async (channelId: string) => void calls.push(`subscribe:${channelId}`),
      unsubscribe: async (channelId: string) => void calls.push(`unsubscribe:${channelId}`),
      setNotificationPreferences: async (channelId: string, type: string) =>
        void calls.push(`notifications:${channelId}:${type}`),
    },
    actions: {
      execute: async (endpoint: string, args?: Record<string, unknown>) => {
        calls.push(endpoint)
        payloads.push({ endpoint, args })
        const relatedNext = {
          call: async () => ({
            on_response_received_endpoints_memo: new Map<string, unknown[]>([
              ['CompactVideo', [{ video_id: 'related-next', title: { text: 'More like this' } }]],
            ]),
          }),
        }
        const memo: [string, unknown[]][] = [
          ['VideoPrimaryInfo', [{ view_count: { view_count: { text: '42 views' } } }]],
          // A Map keeps the last value for a duplicate key, so a second TwoColumnWatchNextResults would silently hide this one
          ['TwoColumnWatchNextResults', [{
            // Mirrors the real nesting: a flat fixture here would pass while the real response does not
            secondary_results: [
              { contents: [
                { video_id: 'rel1', title: { text: 'Related one' } },
                { endpoint: relatedNext },
              ] },
            ],
            ...(args?.playlistId
              ? {
                  playlist: {
                    id: args.playlistId,
                    title: 'Queue',
                    author: { name: 'Owner' },
                    contents: [
                      { video_id: 'q1', title: { text: 'First' }, thumbnail: [{ url: 'q1.jpg', width: 320 }], duration: { seconds: 61 } },
                      { primary: { video_id: 'q2', title: { text: 'Second' } } },
                      { playlist_video: {} },
                    ],
                    current_index: args.playlistIndex ?? 0,
                    is_infinite: false,
                  },
                }
              : {}),
          }]],
          ['ContinuationItem', [{ endpoint: { call: async () => ({}) } }]],
        ]
        return {
          success: true,
          // `playlistId` is optional on the wire and is never validated upstream
          data: (endpoint === '/reel/reel_item_watch'
            ? { replacementEndpoint: { reelWatchEndpoint: { videoId: 'seedless-short' } } }
            : { playlistId: 'PLnew' }) as { playlistId?: string, replacementEndpoint?: { reelWatchEndpoint?: { videoId?: string } } },
          contents_memo: new Map<string, unknown[]>(memo),
          actions_memo: endpoint === '/account/accounts_list' ? Parser.parseResponse(accountsListAnswer(twoChannels('own'))).actions_memo : undefined,
        }
      },
    },
  }
}

describe('youtube comment writes', () => {
  it('acts through the endpoint the page arrived with, not the comment id', async () => {
    commentCalls.length = 0
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const page = await source.comments('abc')
    const token = page.items[0]?.actionsToken
    expect(token).toBeTruthy()

    await source.rateComment(token!, 'LIKE')
    await source.rateComment(token!, 'DISLIKE')
    await source.rateComment(token!, 'INDIFFERENT')
    await source.replyToComment(token!, 'well said')
    expect(commentCalls).toEqual([
      'like:top',
      'dislike:top',
      'unlike:top',
      'reply:top:{"commentText":"well said"}',
    ])
  })

  it('reports an evicted comment handle as reloadable rather than failing opaquely', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    await expect(source.rateComment('youtube:comment:99999', 'LIKE'))
      .rejects.toThrow('no longer available')
  })

  it('posts a top-level comment through the video rather than a handle', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.postComment('abc', 'first')).resolves.toBe(true)
    expect(client.calls).toContain('comment:abc:first')
  })
})

describe('youtube search', () => {
  it('keeps channel and playlist hits that the videos getter drops', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const results = await source.search('query')
    expect(results.results.map((row) => row.kind)).toEqual(['video', 'channel'])
    expect(results.results[0]).toMatchObject({ kind: 'video', id: 'search' })
    expect(results.results[1]).toMatchObject({ kind: 'channel', id: 'UCchannel', name: 'A Channel' })
    expect(results.refinements).toEqual(['refined query'])
    expect(results.estimatedResults).toBe(1234)
  })

  it('translates the filter vocabulary and drops the unset axes', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await source.search('query', { uploadDate: 'WEEK', sortBy: 'POPULARITY', features: ['FOUR_K', 'CREATIVE_COMMONS'] })
    await source.search('query', { uploadDate: 'ALL', type: 'ALL' })
    expect(client.searchFilters[0]).toEqual({
      upload_date: 'week',
      type: undefined,
      duration: undefined,
      prioritize: 'popularity',
      features: ['4k', 'creative_commons'],
    })
    expect(client.searchFilters[1]).toBeUndefined()
  })

  it('refuses a cursor minted under a different filter set', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const unfiltered = await source.search('query')
    expect(unfiltered.cursor).toBeTruthy()
    await expect(source.search('query', { uploadDate: 'WEEK' }, unfiltered.cursor))
      .rejects.toThrow('belongs to')
    await expect(source.search('query', undefined, unfiltered.cursor)).resolves.toBeTruthy()
  })
})

describe('youtube channel tabs', () => {
  it('browses a channel once and serves every tab off it', async () => {
    const client = createFakeClient()
    let fetches = 0
    const inner = client.getChannel
    client.getChannel = async () => {
      fetches += 1
      return inner()
    }
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await source.channel('c')
    await source.channel('c', 'PLAYLISTS')
    await source.channel('c', 'COMMUNITY')
    await source.channelAbout('c')
    await source.communityPosts('c')
    expect(fetches).toBe(1)
  })


  it('reports only the tabs the channel actually has', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const result = await source.channel('c')
    expect(result.availableTabs).toEqual(['VIDEOS', 'PLAYLISTS', 'COMMUNITY', 'ABOUT'])
    expect(result.tab).toBe('VIDEOS')
    expect(result.videos.items[0]?.id).toBe('channel-videos')
  })

  it('opens the requested tab and ignores one the channel does not have', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const playlists = await source.channel('c', 'PLAYLISTS')
    expect(playlists.tab).toBe('PLAYLISTS')
    expect(playlists.videos.items[0]?.id).toBe('channel-playlists')
    const missing = await source.channel('c', 'SHORTS')
    expect(missing.tab).toBe('VIDEOS')
  })

  it('sorts the Videos tab by its chip bar, through the chip itself', async () => {
    const client = createFakeClient()
    const applied: unknown[] = []
    const chips = ['Latest', 'Popular', 'Oldest'].map((text) => ({ text, display_type: 'CHIP_VIEW_MODEL_DISPLAY_TYPE_UNSPECIFIED' }))
    const inner = client.getChannel
    client.getChannel = async () => Object.assign(await inner(), {
      async getVideos() {
        return {
          ...feed('latest'),
          memo: new Map<string, unknown[]>([['ChipView', chips]]),
          applyFilter: async (chip: unknown) => {
            applied.push(chip)
            return feed('oldest')
          },
        }
      },
    })
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const latest = await source.channel('c', 'VIDEOS')
    expect(latest.sortOptions).toEqual(['Latest', 'Popular', 'Oldest'])
    expect(applied).toEqual([])
    const oldest = await source.channel('c', 'VIDEOS', 'Oldest')
    expect(oldest.appliedSort).toBe('Oldest')
    expect(applied).toEqual([chips[2]])
    expect(oldest.videos.items[0]?.id).toBe('oldest')
  })

  it('refuses a cursor minted for a different tab of the same channel', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const videos = await source.channel('c')
    expect(videos.videos.cursor).toBeTruthy()
    await expect(source.channel('c', 'PLAYLISTS', undefined, undefined, videos.videos.cursor))
      .rejects.toThrow('belongs to')
  })

  // youtube.com's signed-out answer for a channel id nobody holds, read 2026-11-10, less its tracking fields
  it('rejects with upstream\'s own line for a channel that does not exist, marked apart from any other failure', async () => {
    const answer = {
      header: { c4TabbedHeaderRenderer: { channelId: 'UCzzzzzzzzzzzzzzzzzzzzzz', avatar: { thumbnails: [{ url: 'https://yt3.googleusercontent.com/a/default-user=s100-c-k-c0x00ffffff-no-rj', width: 100, height: 100 }] } } },
      alerts: [{ alertRenderer: { type: 'ERROR', text: { simpleText: 'This channel does not exist.' } } }],
    }
    const missing = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => ({
        getChannel: async () => new YT.Channel(undefined as never, Parser.parseResponse(answer as never), true),
      }) as never,
    })
    await expect(missing.channel('UCzzzzzzzzzzzzzzzzzzzzzz')).rejects.toThrow(new Error(`${CHANNEL_UNAVAILABLE}This channel does not exist.`))
    const broken = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => ({
        getChannel: async () => { throw new Error('Tab "featured" not found') },
      }) as never,
    })
    await expect(broken.channel('UCzzzzzzzzzzzzzzzzzzzzzz')).rejects.toThrow(new Error('Tab "featured" not found'))
  })

  it('rejects a handle upstream answers 404 for as not found, and any other failure as it came', async () => {
    const resolving = (error: Error) => createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => ({ resolveURL: async () => { throw error } }) as never,
    })
    // youtubei.js's own words for a failed request, measured on resolve_url for a missing handle on 2026-11-10
    const failed = (status: number) => new Error(`Request to https://www.youtube.com/youtubei/v1/navigation/resolve_url?prettyPrint=false&alt=json failed with status code ${status}`)
    await expect(resolving(failed(404)).channel('@thischanneldoesnotexist9876543')).rejects.toThrow(new Error(CHANNEL_NOT_FOUND))
    await expect(resolving(failed(500)).channel('@someone')).rejects.toThrow(failed(500))
    await expect(resolving(new TypeError('Failed to fetch')).channel('@someone')).rejects.toThrow(new TypeError('Failed to fetch'))
  })
})

describe('youtube source', () => {
  // start() runs immediately after the listeners are attached, so its call is the signal that emitting is safe
  const chatStarted = async (client: { calls: string[] }) => {
    for (let attempt = 0; attempt < 100 && !client.calls.includes('livechat:start'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  const chatItem = (id: string, message: string) => ({
    id,
    message: { runs: [{ text: message }] },
    author: { id: 'UCchat', name: 'Viewer', thumbnails: [{ url: 'avatar', width: 32 }] },
    timestamp_text: '1:02',
  })

  it('buffers live chat between polls and keeps the session running', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const opened = source.liveChat('abc')
    await chatStarted(client)
    client.emitChat({ item: chatItem('c1', 'hello') })
    const first = await opened
    expect(client.calls).toContain('livechat:start')
    expect(first.items.map((item) => item.id)).toEqual(['c1'])
    expect(first.cursor).toBeTruthy()

    client.emitChat({ item: chatItem('c2', 'still here') })
    const second = await source.liveChat('abc', first.cursor)
    expect(second.items.map((item) => item.id)).toEqual(['c2'])
    expect(client.calls.filter((call) => call === 'livechat:start')).toHaveLength(1)
  })

  it('carries a removal as its own instruction', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const opened = source.liveChat('abc')
    await chatStarted(client)
    client.emitChat({ item: chatItem('c1', 'oops') })
    const first = await opened
    client.emitChat({ target_item_id: 'c1' })
    const second = await source.liveChat('abc', first.cursor)
    expect(second.removedIds).toEqual(['c1'])
    expect(second.items).toEqual([])
  })

  it('stops polling once the stream ends', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const opened = source.liveChat('abc')
    await chatStarted(client)
    client.emitChat({ item: chatItem('c1', 'bye') })
    const first = await opened
    client.endChat()
    const second = await source.liveChat('abc', first.cursor)
    expect(second.cursor).toBeUndefined()
    expect(client.calls).toContain('livechat:stop')
  })

  it('opens the chat again on a cursor it never issued, as after an engine reset', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const reopened = source.liveChat('abc', 'youtube:livechat:abc:7')
    await chatStarted(client)
    client.emitChat({ item: chatItem('c1', 'back') })
    const page = await reopened
    expect(page.items.map((item) => item.id)).toEqual(['c1'])
    expect(page.cursor).toBeTruthy()
    expect(await source.liveChat('abc', page.cursor)).toMatchObject({ items: [] })
  })

  it('never answers a replaced engine\'s cursor with that same cursor', async () => {
    const before = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => createFakeClient() })
    const old = (await before.liveChat('abc')).cursor!
    const client = createFakeClient()
    const after = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const reopened = after.liveChat('abc', old)
    await chatStarted(client)
    client.emitChat({ item: chatItem('c1', 'back') })
    const page = await reopened
    expect(page.items.map((item) => item.id)).toEqual(['c1'])
    expect(page.cursor).toBeTruthy()
    expect(page.cursor).not.toBe(old)
  })

  it('reports chat being unavailable rather than throwing', async () => {
    // getLiveChat() THROWS when a video carries no chat, so absence is checked before calling it
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const page = await source.liveChat('nochat')
    expect(page).toEqual({ items: [], disabled: true })
    expect(client.calls).not.toContain('livechat:start')
  })

  it('sends through the session the panel already has open', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.sendLiveChatMessage('abc', 'hi')).rejects.toThrow('live chat is not open')
    await source.liveChat('abc')
    await source.sendLiveChatMessage('abc', 'hi')
    expect(client.calls).toContain('livechat:send:hi')
  })

  it('resolves an @handle into a browse id before browsing a channel', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await source.channel('@someone')
    expect(client.calls).toContain('resolveURL:https://www.youtube.com/@someone')

    client.calls.length = 0
    await source.channel('UCdirect')
    expect(client.calls.some((call) => call.startsWith('resolveURL:'))).toBe(false)
  })

  it('resolves youtube.com\'s older /c/ and /user/ channel addresses the same way', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await source.channel('c/mkbhd')
    await source.channel('user/marquesbrownlee')
    expect(client.calls.filter((call) => call.startsWith('resolveURL:'))).toEqual([
      'resolveURL:https://www.youtube.com/c/mkbhd',
      'resolveURL:https://www.youtube.com/user/marquesbrownlee',
    ])
  })

  it('keeps continuations opaque and replayable', async () => {
    const client = createFakeClient()
    let continuationCalls = 0
    client.getHomeFeed = async () => feed('first', async () => {
      continuationCalls += 1
      return feed('second')
    })
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => client,
    })
    const first = await source.home()
    expect(first.items[0]?.id).toBe('first')
    expect(first.cursor).toBeTruthy()
    const second = await source.home(undefined, first.cursor)
    expect(second.items[0]?.id).toBe('second')
    // urql re-executes a query on remount and on back-navigation, so replaying a cursor must return the same page
    const replay = await source.home(undefined, first.cursor)
    expect(replay.items[0]?.id).toBe('second')
    expect(continuationCalls).toBe(1)
    await expect(source.home(undefined, 'youtube:home:999')).rejects.toThrow('unknown continuation')
  })

  it('opens the shorts pager on the short a deep link names', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const page = await source.shorts('abc')
    expect(page.items.map((item) => item.id)).toEqual(['abc', 'reel-1', 'reel-2'])
    expect(page.items[0]?.title).toBe('Seed abc')
    expect(page.items[1]?.poster).toBe('reel-1.jpg')
    expect(page.items[1]?.title).toBe('Prefetched title')
    expect(page.items[2]?.title).toBeUndefined()
  })

  it('pages the shorts sequence even though it continues by mutation', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const first = await source.shorts('abc')
    expect(first.cursor).toBeTruthy()
    const second = await source.shorts(undefined, first.cursor)
    expect(second.items.map((item) => item.id)).toEqual(['reel-page-1'])
    const third = await source.shorts(undefined, second.cursor)
    expect(third.items.map((item) => item.id)).toEqual(['reel-page-2'])
    expect(third.cursor).toBeUndefined()
  })

  it('seeds a shorts feed with no id from the home shelf', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const page = await source.shorts()
    expect(page.items[0]?.id).toBe('short-first')
  })

  it('seeds a signed-out shorts feed where youtube.com\'s own guide entry does', async () => {
    const client = createFakeClient()
    client.session.logged_in = false
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => client,
    })
    const page = await source.shorts()
    expect(page.items.map((item) => item.id)).toEqual(['seedless-short', 'reel-1', 'reel-2'])
    expect(client.payloads).toContainEqual({
      endpoint: '/reel/reel_item_watch',
      args: { params: 'CA8=', inputType: 'REEL_WATCH_INPUT_TYPE_SEEDLESS' },
    })
  })

  it('refuses a cursor issued for a different feed', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const home = await source.home()
    expect(home.cursor).toBeTruthy()
    await expect(source.search('query', undefined, home.cursor)).rejects.toThrow('unknown continuation')
    await expect(source.subscriptions(home.cursor)).rejects.toThrow('unknown continuation')
    const channel = await source.channel('c')
    expect(channel.videos.cursor).toBeTruthy()
    await expect(source.subscriptions(channel.videos.cursor)).rejects.toThrow('belongs to channel')
  })

  it('lets a failed continuation be retried instead of caching the failure', async () => {
    const client = createFakeClient()
    let attempts = 0
    client.getHomeFeed = async () => feed('first', async () => {
      attempts += 1
      if (attempts === 1) throw new Error('network blip')
      return feed('second')
    })
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => client,
    })
    const first = await source.home()
    await expect(source.home(undefined, first.cursor)).rejects.toThrow('network blip')
    await expect(source.home(undefined, first.cursor)).resolves.toMatchObject({ items: [{ id: 'second' }] })
  })

  it('fetches watch metadata through a single /next call', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    await expect(source.watch('abc')).resolves.toMatchObject({
      id: 'abc',
      viewCountText: '42 views',
      related: [],
    })
  })

  it('pages comments with cursors scoped to their video', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const first = await source.comments('abc')
    expect(first.items[0]?.id).toBe('top')
    expect(first.cursor).toBeTruthy()
    const second = await source.comments('abc', undefined, first.cursor)
    expect(second.items[0]?.id).toBe('next')
    expect(second.cursor).toBeUndefined()
    await expect(source.comments('abc', undefined, first.cursor)).resolves.toMatchObject({ items: [{ id: 'next' }] })
    await expect(source.comments('other', undefined, first.cursor)).rejects.toThrow('belongs to comments:abc')
    await expect(source.comments('abc', 'NEWEST', first.cursor)).rejects.toThrow('belongs to comments:abc:TOP')
  })

  it('reads a post\'s comments by the post and its channel, with cursors scoped to that post and sort', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const first = await source.postComments('post', 'UC1')
    expect(first).toMatchObject({ items: [{ id: 'post-top' }], countText: '1,045 Comments' })
    await expect(source.postComments('post', 'UC1', undefined, first.cursor)).resolves.toMatchObject({ items: [{ id: 'post-next' }] })
    await expect(source.postComments('other', 'UC1', undefined, first.cursor)).rejects.toThrow('belongs to post-comments:post:TOP')
    await expect(source.comments('post', undefined, first.cursor)).rejects.toThrow('belongs to post-comments:post:TOP')
    await source.postComments('post', 'UC1', 'NEWEST')
    expect(client.calls.filter(call => call.startsWith('getPostComments'))).toEqual([
      'getPostComments:post:UC1:TOP_COMMENTS',
      'getPostComments:post:UC1:NEWEST_FIRST',
    ])
  })

  it('heads comments with the full count, not the rounded one', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    await expect(source.comments('abc')).resolves.toMatchObject({ countText: '2,461,151 Comments' })
  })

  it('pages a playlist with cursors scoped to that playlist', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const first = await source.playlist('PL1')
    expect(first.items[0]?.video.id).toBe('PL1-first')
    expect(first.items[0]?.setVideoId).toBe('set-PL1-first')
    expect(first.items[0]?.index).toBe(1)
    const second = await source.playlist('PL1', first.cursor)
    expect(second.items[0]?.video.id).toBe('PL1-second')
    expect(second.playlist).toEqual(first.playlist)
    await expect(source.playlist('PL2', first.cursor)).rejects.toThrow('belongs to playlist:PL1')
  })

  it('reads playlist details off the first page and covers it with the first row', async () => {
    const client = createFakeClient()
    client.getPlaylist = async (id: string) => ({
      ...playlist(id),
      memo: new Map<string, unknown[]>([['PlaylistVideo', [
        { id: 'row', title: { text: 'Row' }, thumbnails: [{ url: 'cover', width: 640 }] },
      ]]]),
    })
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.playlist('PL1')).resolves.toMatchObject({
      playlist: { id: 'PL1', title: 'My playlist', videoCountText: '2 videos', thumbnail: 'cover' },
    })
  })

  it('opens a playlist signed out and gates only the playlist library', async () => {
    const client = createFakeClient()
    client.session.logged_in = false
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.playlists()).rejects.toThrow('sign in to see your playlists')
    await expect(source.playlist('PL1')).resolves.toMatchObject({ playlist: { id: 'PL1' } })
  })

  it('pages the playlist library', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const first = await source.playlists()
    expect(first.items).toEqual([
      { id: 'PLone', title: 'PLone', thumbnail: undefined, videoCountText: '3 videos', channel: undefined },
    ])
    const second = await source.playlists(first.cursor)
    expect(second.items[0]?.id).toBe('PLtwo')
    expect(second.cursor).toBeUndefined()
  })

  it('reports a signed-out session without hitting the account API', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => client,
    })
    await expect(source.session()).resolves.toEqual({ signedIn: false, accounts: [] })
    expect(client.calls).toEqual([])
  })

  it("lists the signed-in Google account's channels from WEB's accounts_list, which carries their page IDs", async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => client,
      signedIn: () => true,
    })
    await expect(source.session()).resolves.toMatchObject({
      signedIn: true,
      name: 'Viewer',
      handle: '@viewer',
      accounts: [
        { brandPageId: undefined, handle: '@viewer', selected: true },
        { brandPageId: BRAND_PAGE_ID, handle: '@viewer-brand', selected: undefined },
      ],
    })
    expect(client.payloads).toEqual([{ endpoint: '/account/accounts_list', args: { client: 'WEB', parse: true } }])
  })

  // Nothing in the type system ties SOURCE_CURSOR_ARGUMENT's index to the real signature, so these cases pin the position
  // commentReplies and relatedVideos are deliberately absent: their ONLY argument is the cursor, so there are no leading arguments
  const CURSOR_CASES: Record<
    Exclude<keyof typeof SOURCE_CURSOR_ARGUMENT, 'commentReplies' | 'relatedVideos'>,
    string[]
  > = {
    home: [undefined as unknown as string],
    shorts: [undefined as unknown as string],
    subscriptions: [],
    history: [],
    search: ['query', undefined as unknown as string],
    channel: ['c', undefined as unknown as string, undefined as unknown as string, undefined as unknown as string],
    comments: ['abc', undefined as unknown as string],
    postComments: ['post', 'UC1', undefined as unknown as string],
    liveChat: ['abc'],
    liveChatReplay: ['abc', 0 as unknown as string, undefined as unknown as string],
    communityPosts: ['c'],
    notifications: [],
    playlists: [],
    playlist: ['PL1'],
  }

  for (const [method, leading] of Object.entries(CURSOR_CASES)) {
    it(`reads the ${method} cursor from the argument runtime.ts retries on`, async () => {
      expect(SOURCE_CURSOR_ARGUMENT[method as keyof typeof SOURCE_CURSOR_ARGUMENT]).toBe(leading.length)
      const source = createYoutubeSource({
        fetch: globalThis.fetch,
        createClient: async () => createFakeClient(),
      })
      const call = source[method as keyof typeof CURSOR_CASES] as (...args: unknown[]) => Promise<unknown>
      await call(...leading)
      await expect(call(...leading, 'youtube:bogus')).rejects.toThrow('unknown continuation')
    })
  }

  it('rates a video on the WEB client rather than through the TV-context manager', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.rateVideo('abc', 'LIKE')).resolves.toMatchObject({ id: 'abc', likeStatus: 'LIKE' })
    await source.rateVideo('abc', 'DISLIKE')
    await source.rateVideo('abc', 'INDIFFERENT')
    expect(client.calls).toEqual(['/like/like', '/like/dislike', '/like/removelike'])
  })

  it('carries playlist context into the /next call and reads the queue back', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const meta = await source.watch('abc', 'PL1', 0)
    // `playlistIndex` is the key /next reads; `index` is only an alias inside WatchNextEndpoint.buildRequest, which execute never runs
    expect(client.payloads[0]?.args).toMatchObject({ videoId: 'abc', playlistId: 'PL1', playlistIndex: 0 })
    expect(client.payloads[0]?.args).not.toHaveProperty('index')
    expect(meta?.playlist).toMatchObject({ id: 'PL1', title: 'Queue', author: 'Owner', currentIndex: 0, isInfinite: false })
    expect(meta?.playlist?.items.map((video) => video.id)).toEqual(['q1', 'q2'])
    expect(meta?.playlist?.items[0]).toMatchObject({ thumbnail: 'q1.jpg', durationSeconds: 61 })
  })

  it('leaves the playlist keys off a watch with no playlist context', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const meta = await source.watch('abc')
    expect(client.payloads[0]?.args).not.toHaveProperty('playlistId')
    expect(client.payloads[0]?.args).not.toHaveProperty('playlistIndex')
    expect(meta?.playlist).toBeUndefined()
  })

  it('edits playlist rows through one endpoint, addressing entries by set video id', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await source.addToPlaylist('PL1', ['a', 'b'])
    await source.removeFromPlaylist('PL1', ['set-a'])
    await source.movePlaylistItem('PL1', 'set-b', 'set-a')
    await source.movePlaylistItem('PL1', 'set-b')
    expect(client.calls).toEqual(Array.from({ length: 4 }, () => 'browse/edit_playlist'))
    expect(client.payloads.map((call) => call.args)).toEqual([
      {
        playlistId: 'PL1',
        actions: [
          { action: 'ACTION_ADD_VIDEO', addedVideoId: 'a' },
          { action: 'ACTION_ADD_VIDEO', addedVideoId: 'b' },
        ],
      },
      { playlistId: 'PL1', actions: [{ action: 'ACTION_REMOVE_VIDEO', setVideoId: 'set-a' }] },
      {
        playlistId: 'PL1',
        actions: [{ action: 'ACTION_MOVE_VIDEO_AFTER', setVideoId: 'set-b', movedSetVideoIdPredecessor: 'set-a' }],
      },
      { playlistId: 'PL1', actions: [{ action: 'ACTION_MOVE_VIDEO_AFTER', setVideoId: 'set-b' }] },
    ])
  })

  it('renames through a payload that actually carries the playlist id', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.renamePlaylist('PL1', 'New name')).resolves.toMatchObject({ id: 'PL1', title: 'New name' })
    // youtubei.js's setName writes the id as snake_case `playlist_id`, which PlaylistEditEndpoint drops, so it has to go out as camelCase `playlistId`
    expect(client.payloads[0]).toEqual({
      endpoint: 'browse/edit_playlist',
      args: { playlistId: 'PL1', actions: [{ action: 'ACTION_SET_PLAYLIST_NAME', playlistName: 'New name' }] },
    })
  })

  it('sets a description and a privacy through the same edit endpoint', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.setPlaylistDescription('PL1', 'About')).resolves.toMatchObject({ id: 'PL1', description: 'About' })
    await expect(source.setPlaylistPrivacy('PL1', 'UNLISTED')).resolves.toMatchObject({ id: 'PL1', privacy: 'UNLISTED' })
    expect(client.payloads.map((call) => call.args?.actions)).toEqual([
      [{ action: 'ACTION_SET_PLAYLIST_DESCRIPTION', playlistDescription: 'About' }],
      [{ action: 'ACTION_SET_PLAYLIST_PRIVACY', playlistPrivacy: 'UNLISTED' }],
    ])
  })

  it('creates a playlist through the endpoint so privacy and description survive', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.createPlaylist('Mix', ['a'], 'PRIVATE', 'Notes')).resolves.toEqual({
      id: 'PLnew',
      title: 'Mix',
      description: 'Notes',
      privacy: 'PRIVATE',
    })
    expect(client.payloads[0]).toEqual({
      endpoint: 'playlist/create',
      args: { title: 'Mix', videoIds: ['a'], privacyStatus: 'PRIVATE', description: 'Notes' },
    })
  })

  it('refuses a created playlist whose id did not come back', async () => {
    const client = createFakeClient()
    client.actions.execute = async () => ({
      success: true,
      data: {} as { playlistId?: string },
      contents_memo: new Map<string, unknown[]>(),
      actions_memo: undefined,
    })
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.createPlaylist('Mix')).rejects.toThrow('its id did not come back')
  })

  it('deletes through the path youtubei.js cannot reach', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    // client.playlist.delete throws before the network in 18.3.0: it builds a raw key with no registered endpoint class
    await expect(source.deletePlaylist('PL1')).resolves.toBe('PL1')
    expect(client.payloads[0]).toEqual({ endpoint: 'playlist/delete', args: { playlistId: 'PL1' } })
  })

  it('carries a read playlist forward into what a write resolves to', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await source.playlist('PL1')
    await expect(source.addToPlaylist('PL1', ['a'])).resolves.toMatchObject({ id: 'PL1', title: 'My playlist' })
  })

  it('does not POST an edit for an empty selection', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await source.addToPlaylist('PL1', [])
    await source.removeFromPlaylist('PL1', [])
    expect(client.payloads).toEqual([])
  })

  it('refuses playlist writes when signed out', async () => {
    const client = createFakeClient()
    client.session.logged_in = false
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.addToPlaylist('PL1', ['a'])).rejects.toThrow('sign in to save to a playlist')
    await expect(source.removeFromPlaylist('PL1', ['set-a'])).rejects.toThrow('sign in to change a playlist')
    await expect(source.renamePlaylist('PL1', 'x')).rejects.toThrow('sign in to rename a playlist')
    await expect(source.setPlaylistDescription('PL1', 'x')).rejects.toThrow('sign in to change a playlist description')
    await expect(source.setPlaylistPrivacy('PL1', 'PRIVATE')).rejects.toThrow('sign in to change a playlist privacy')
    await expect(source.movePlaylistItem('PL1', 'set-a')).rejects.toThrow('sign in to reorder a playlist')
    await expect(source.createPlaylist('Mix')).rejects.toThrow('sign in to create a playlist')
    await expect(source.deletePlaylist('PL1')).rejects.toThrow('sign in to delete a playlist')
    expect(client.payloads).toEqual([])
  })

  it('classifies every playlist write as non-replayable', () => {
    const writes = [
      'addToPlaylist',
      'removeFromPlaylist',
      'createPlaylist',
      'deletePlaylist',
      'renamePlaylist',
      'setPlaylistDescription',
      'setPlaylistPrivacy',
      'movePlaylistItem',
    ] as const
    for (const method of writes) expect(SOURCE_REPLAY[method]).toBe('never')
  })

  it('returns the channel with its new subscription state', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.setSubscribed('c', true)).resolves.toMatchObject({ id: 'c', isSubscribed: true })
    await expect(source.setSubscribed('c', false)).resolves.toMatchObject({ id: 'c', isSubscribed: false })
    await expect(source.setNotificationLevel('c', 'ALL')).resolves.toMatchObject({ id: 'c', notificationLevel: 'ALL' })
    expect(client.calls).toEqual(['subscribe:c', 'unsubscribe:c', 'notifications:c:ALL'])
  })

  it('keeps a loaded channel in step with a subscription write', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await source.channel('c')
    const updated = await source.setSubscribed('c', true)
    expect(updated).toMatchObject({ id: 'c', name: 'Channel', isSubscribed: true })
  })

  it('reads a channel again after a subscription or bell write rather than serving the browse from before it', async () => {
    const client = createFakeClient()
    const state = { subscribed: false, level: 'PERSONALIZED' }
    const inner = client.getChannel
    client.getChannel = async () => Object.assign(await inner(), {
      subscribe_button: { subscribed: state.subscribed, notification_preference_button: { current_state_id: state.level } },
    })
    client.interact.subscribe = async () => {
      state.subscribed = true
    }
    client.interact.setNotificationPreferences = async (_channelId: string, level: string) => {
      state.level = level
    }
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    expect((await source.channel('c')).channel).toMatchObject({ isSubscribed: false, notificationLevel: 'PERSONALIZED' })
    await source.setSubscribed('c', true)
    expect((await source.channel('c', 'PLAYLISTS')).channel.isSubscribed).toBe(true)
    await source.setNotificationLevel('c', 'ALL')
    expect((await source.channel('c', 'COMMUNITY')).channel.notificationLevel).toBe('ALL')
  })

  it('keeps a subscription or bell write on the next page of a channel opened by its handle', async () => {
    for (const opened of ['c', '@someone']) {
      const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => createFakeClient() })
      const first = await source.channel(opened)
      await source.setSubscribed(first.channel.id, true)
      await source.setNotificationLevel(first.channel.id, 'ALL')
      const next = await source.channel(opened, undefined, undefined, undefined, first.videos.cursor)
      expect(next.channel, `opened by ${opened}`).toMatchObject({ isSubscribed: true, notificationLevel: 'ALL' })
    }
  })

  it('refuses writes when signed out instead of emitting an opaque innertube error', async () => {
    const client = createFakeClient()
    client.session.logged_in = false
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.rateVideo('abc', 'LIKE')).rejects.toThrow('sign in to rate a video')
    await expect(source.setSubscribed('c', true)).rejects.toThrow('sign in to change a subscription')
    expect(client.calls).toEqual([])
  })

  it('groups history by its section headings', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
      signedIn: () => true,
    })
    const page = await source.history()
    expect(page.sections.map((section) => section.title)).toEqual(['Today', 'Yesterday'])
    expect(page.sections[0]?.items[0]?.id).toBe('today')
  })

  it('refuses signed-out reads of the account feeds before any request', async () => {
    const client = createFakeClient()
    client.session.logged_in = false
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.subscriptions()).rejects.toThrow('sign in to see your subscriptions')
    await expect(source.history()).rejects.toThrow('sign in to see your history')
    await expect(source.subscribedChannels()).rejects.toThrow('sign in to see your subscriptions')
    expect(client.calls).toEqual([])
  })

  it('normalizes the subscribed channel rail off its author node', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
      signedIn: () => true,
    })
    await expect(source.subscribedChannels()).resolves.toEqual([
      { id: 'UC1', name: 'Chan', avatar: 'a', handle: undefined, subscriberCountText: undefined, videoCountText: undefined },
    ])
  })

  it('pages the subscribed channels only when asked for all of them, and stops at 20 pages', async () => {
    let browses = 0
    const channelsPage = (index: number): { channels: unknown[], has_continuation: boolean, getContinuation(): Promise<unknown> } => {
      browses++
      return {
        channels: [
          { author: { id: `UC${index}`, name: `Chan ${index}` } },
          // continuations overlap, so the previous page's last channel comes back
          ...(index > 0 ? [{ author: { id: `UC${index - 1}`, name: `Chan ${index - 1}` } }] : []),
        ],
        has_continuation: true,
        getContinuation: async () => channelsPage(index + 1),
      }
    }
    const client = createFakeClient()
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => ({ ...client, getChannelsFeed: async () => channelsPage(0) }) as never,
    })

    expect((await source.subscribedChannels()).map(channel => channel.id)).toEqual(['UC0'])
    expect(browses).toBe(1)

    browses = 0
    const all = await source.subscribedChannels(true)
    expect(browses).toBe(20)
    expect(all.map(channel => channel.id)).toEqual(Array.from({ length: 20 }, (_, index) => `UC${index}`))
  })

  it('removes from history without needing the page to be open first', async () => {
    const client = createFakeClient()
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => client,
      signedIn: () => true,
    })
    await expect(source.removeFromHistory('today')).resolves.toBe('today')
    expect(client.calls).toContain('removeHistory:today')
  })

  it('fails a history removal YouTube did not process', async () => {
    const client = createFakeClient()
    client.getHistory = async () => ({
      ...feed('watched'),
      sections: [] as { header: { title: string }, contents: { video_id: string, title: { text: string } }[] }[],
      removeVideo: async () => false,
    })
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client, signedIn: () => true })
    await expect(source.removeFromHistory('kept')).rejects.toThrow('not removed from your history')
  })

  it('asks removeVideo to look past the first page', async () => {
    const client = createFakeClient()
    const requested: (number | undefined)[] = []
    client.getHistory = async () => ({
      ...feed('watched'),
      sections: [] as { header: { title: string }, contents: { video_id: string, title: { text: string } }[] }[],
      removeVideo: async (videoId: string, pagesToLoad?: number) => {
        requested.push(pagesToLoad)
        return void videoId
      },
    })
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => client,
      signedIn: () => true,
    })
    await source.removeFromHistory('deep')
    expect(requested[0]).toBeGreaterThan(1)
  })

  it('reads the Home chip bar as youtubei.js parses it, and filters through a chip', async () => {
    const chipRenderer = (label: string, token: string, isSelected: boolean) => ({
      chipCloudChipRenderer: {
        text: { runs: [{ text: label }] },
        isSelected,
        navigationEndpoint: {
          commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: '/youtubei/v1/browse' } },
          continuationCommand: { token, request: 'CONTINUATION_REQUEST_TYPE_BROWSE' },
        },
      },
    })
    const response = {
      contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: { richGridRenderer: {
        contents: [],
        header: { feedFilterChipBarRenderer: { contents: [chipRenderer('All', 'ALL', true), chipRenderer('Music', 'MUSIC', false)] } },
      } } } }] } },
    }
    const client = createFakeClient()
    const sent: unknown[] = []
    const actions = {
      session: client.session,
      execute: async (_path: string, args: Record<string, unknown>) => {
        sent.push(args.continuation)
        return Parser.parseResponse(response as never)
      },
    }
    client.getHomeFeed = async () => new YT.HomeFeed(actions as never, { data: response } as never) as never
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.home()).resolves.toMatchObject({
      chips: [{ id: 'ALL', label: 'All', selected: true }, { id: 'MUSIC', label: 'Music', selected: false }],
    })
    await source.home('MUSIC')
    expect(sent).toEqual(['MUSIC'])
  })

  it('reads the items of a dropdown chip as Home chips, and filters through one', async () => {
    const listItem = (label: string, token: string, isSelected: boolean) => ({
      listItemViewModel: {
        title: { content: label },
        isSelected,
        rendererContext: { commandContext: { onTap: { innertubeCommand: {
          commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: '/youtubei/v1/browse' } },
          continuationCommand: { token, request: 'CONTINUATION_REQUEST_TYPE_BROWSE' },
        } } } },
      },
    })
    const response = {
      contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: { richGridRenderer: {
        contents: [],
        header: { chipBarViewModel: { chips: [{ chipViewModel: {
          text: 'All',
          displayType: 'CHIP_VIEW_MODEL_DISPLAY_TYPE_DROP_DOWN',
          tapCommand: { innertubeCommand: { showSheetCommand: { panelLoadingStrategy: { inlineContent: { sheetViewModel: {
            content: { listViewModel: { listItems: [listItem('All', 'ALL', true), listItem('Music', 'MUSIC', false)] } },
          } } } } } },
        } }] } },
      } } } }] } },
    }
    const client = createFakeClient()
    const sent: unknown[] = []
    const actions = {
      session: client.session,
      execute: async (_path: string, args: Record<string, unknown>) => {
        sent.push(args.continuation)
        return Parser.parseResponse(response as never)
      },
    }
    client.getHomeFeed = async () => new YT.HomeFeed(actions as never, { data: response } as never) as never
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.home()).resolves.toMatchObject({
      chips: [{ id: 'ALL', label: 'All', selected: true }, { id: 'MUSIC', label: 'Music', selected: false }],
    })
    await source.home('MUSIC')
    expect(sent).toEqual(['MUSIC'])
  })

  it('survives a feed whose filter_nodes getter throws', async () => {
    const client = createFakeClient()
    client.getHomeFeed = async () => ({
      ...feed('first'),
      // youtubei.js throws from this getter when the response carries more than one chip bar, so optional chaining does not protect the call site
      get filter_nodes (): never { throw new Error('There are too many feed filter chipbars') },
    })
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    await expect(source.home()).resolves.toMatchObject({ items: [{ id: 'first' }], chips: [] })
  })

  it('covers every cursored method declared to runtime.ts', () => {
    const covered = [...Object.keys(CURSOR_CASES), 'commentReplies', 'relatedVideos']
    expect(covered.sort()).toEqual(Object.keys(SOURCE_CURSOR_ARGUMENT).sort())
  })

  it('pages the watch sidebar from its own continuation', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    const meta = await source.watch('abc')
    expect(meta?.relatedCursor).toBeTruthy()
    const more = await source.relatedVideos(meta!.relatedCursor!)
    expect(more.items[0]?.id).toBe('related-next')
    await expect(source.relatedVideos('youtube:bogus')).rejects.toThrow('unknown continuation')
    const channel = await source.channel('c')
    await expect(source.relatedVideos(channel.videos.cursor!)).rejects.toThrow('not a watch sidebar')
  })

  it('takes only a replies cursor, and says so when handed another feed\'s', async () => {
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => createFakeClient(),
    })
    await expect(source.commentReplies('youtube:bogus')).rejects.toThrow('unknown continuation')
    const list = await source.comments('abc')
    expect(list.cursor).toBeTruthy()
    await expect(source.commentReplies(list.cursor!)).rejects.toThrow('not a reply thread')
  })

  it('opens the replies of a thread whose continuation sits under subThreads', async () => {
    const client = createFakeClient()
    // parsed by youtubei.js itself, which keeps `subThreads` apart from `contents` since 18.0.0
    const thread = new YTNodes.CommentThread({
      commentViewModel: { commentViewModel: { commentId: 'threaded' } },
      replies: {
        commentRepliesRenderer: {
          subThreads: [{
            continuationItemRenderer: {
              continuationEndpoint: {
                commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: '/youtubei/v1/next' } },
                continuationCommand: { token: 'REPLY_TOKEN', request: 'CONTINUATION_REQUEST_TYPE_WATCH_NEXT' },
              },
            },
          }],
        },
      },
    })
    client.getComments = async () => ({ contents: [thread], has_continuation: false, getContinuation: async () => { throw new Error('no continuation') } }) as never
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const list = await source.comments('abc')
    expect(list.items[0]?.id).toBe('threaded')
    expect(list.items[0]?.repliesCursor).toBeTruthy()
    await source.commentReplies(list.items[0]!.repliesCursor!)
    expect(client.payloads.at(-1)?.args).toMatchObject({ continuation: 'REPLY_TOKEN' })
  })

  it('only lets a cursored read opt out of replay through a cursor argument', () => {
    for (const [method, policy] of Object.entries(SOURCE_REPLAY)) {
      if (policy === 'unless-cursor') {
        expect(SOURCE_CURSOR_ARGUMENT).toHaveProperty(method)
      } else {
        expect(SOURCE_CURSOR_ARGUMENT).not.toHaveProperty(method)
      }
    }
  })

  it('stays signed in when the account lookup fails', async () => {
    const client = createFakeClient()
    client.actions.execute = async () => {
      throw new Error('account fetch failed')
    }
    const source = createYoutubeSource({
      fetch: globalThis.fetch,
      createClient: async () => client,
      signedIn: () => true,
    })
    await expect(source.session()).resolves.toEqual({ signedIn: true, accounts: [] })
  })
})

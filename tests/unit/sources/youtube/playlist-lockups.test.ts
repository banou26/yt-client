import { describe, expect, it } from 'vite-plus/test'

import { Parser, YT } from 'youtubei.js/web'

import type { YoutubeClient } from '../../../../src/sources/youtube'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import { normalizePlaylistLockupItem } from '../../../../src/sources/youtube/normalize'
import pages from '../../fixtures/playlist-lockups.json'

// "Popular Music Videos" read signed out on 2026-11-01, cut to its first two rows and the first row of the page after
// row 100: every row is a lockupViewModel, and the rest of the list hangs off a continuationItemViewModel
const PLAYLIST = 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'

const parsedClient = () => {
  const sent: unknown[] = []
  const actions = {
    session: { logged_in: false },
    execute: async (path: string, args: Record<string, unknown>) => {
      sent.push({ path, continuation: args.continuation })
      return Parser.parseResponse(pages.next as never)
    },
  }
  const client = {
    session: actions.session,
    actions,
    getPlaylist: async () => new YT.Playlist(actions as never, { data: pages.first } as never),
  } as unknown as YoutubeClient
  return { client, sent }
}

const rowsOf = (list: { video: { id: string, title: string }, index?: number, setVideoId?: string }[]) =>
  list.map(({ video, index, setVideoId }) => ({ id: video.id, title: video.title, index, setVideoId }))

describe('a playlist served as lockup rows', () => {
  it('lists its rows', async () => {
    const { client } = parsedClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const page = await source.playlist(PLAYLIST)
    expect(rowsOf(page.items)).toEqual([
      { id: 'fOT0BUpITw8', title: 'BELLAKEO (Video Oficial) - Peso Pluma, Anitta', index: 1, setVideoId: undefined },
      { id: 'NFvDHYMzj9U', title: 'Arcángel - FN8 ( Video Lyric )', index: 2, setVideoId: undefined },
    ])
    expect(page.playlist).toMatchObject({ id: PLAYLIST, title: 'Popular Music Videos' })
  })

  it('pages past the first hundred rows through its continuation', async () => {
    const { client, sent } = parsedClient()
    const source = createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client })
    const first = await source.playlist(PLAYLIST)
    expect(first.cursor).toBeTruthy()
    const next = await source.playlist(PLAYLIST, first.cursor)
    // the rows' own continuation, not the one after the list that the section list carries
    expect(sent).toEqual([{ path: 'browse', continuation: expect.stringMatching(/^4qmFsgKBARIk/) }])
    expect(rowsOf(next.items)).toEqual([{
      id: '1STyaZA7-BY',
      title: 'Andrea Bocelli, Matteo Bocelli - Holy Night / Cantique de Noël (The Chosen Performance)',
      index: 101,
      setVideoId: undefined,
    }])
    expect(next.cursor).toBeUndefined()
  })
})

describe('a lockup row\'s slot id', () => {
  type MenuRow = { metadata: { menu_button: { on_tap: { command: { inline_content: { content: { items: unknown[] } } } } } } }

  const row = (payload: unknown) => {
    const page = new YT.Playlist({} as never, { data: structuredClone(pages.first) } as never)
    const lockup = page.memo.get('LockupView')?.[0] as unknown as MenuRow
    lockup.metadata.menu_button.on_tap.command.inline_content.content.items.push({
      renderer_context: { command_context: { on_tap: { payload } } },
    })
    return lockup
  }

  it('is read off the row\'s remove action for this playlist', () => {
    const remove = { playlistId: PLAYLIST, actions: [{ action: 'ACTION_REMOVE_VIDEO', setVideoId: 'SLOT' }] }
    expect(normalizePlaylistLockupItem(row(remove), PLAYLIST)?.setVideoId).toBe('SLOT')
  })

  it('stays unset when the action edits another playlist, so the row offers no Remove', () => {
    const remove = { playlistId: 'WL', actions: [{ action: 'ACTION_REMOVE_VIDEO', setVideoId: 'SLOT' }] }
    expect(normalizePlaylistLockupItem(row(remove), PLAYLIST)?.setVideoId).toBeUndefined()
  })
})

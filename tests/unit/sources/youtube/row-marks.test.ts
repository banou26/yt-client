import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser, YT } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import { normalizeWatchMeta } from '../../../../src/sources/youtube/normalize'
import related from '../../fixtures/related-lockups.json'
import search from '../../fixtures/search-never-gonna.json'

/* related-lockups.json is two rows of the related column youtube.com's own watch page read for dQw4w9WgXcQ signed out
   on 2026-11-10 (English, United States): a song, whose length badge carries a music note, and a new upload, whose still
   carries the New badge. search-never-gonna.json is the signed-out search for "never gonna give you up" captured the
   same day, cut to two rows, with the answer its Unwatched chip brings, cut to two other rows. Both are stripped of
   tracking, menus and playback fields and run through the real upstream parser. */

const SONG = 'yPYZpwSpKmA'
const NEW_UPLOAD = 'LO5iHyYa0XM'

const relatedRows = (answer: unknown = related) =>
  normalizeWatchMeta(Parser.parseResponse(answer as never), 'dQw4w9WgXcQ')?.related ?? []

const without = (answer: unknown, key: string) => JSON.parse(JSON.stringify(answer).replaceAll(`"${key}"`, '"dropped"'))

type Sent = { path: string, continuation?: unknown }

const searchSource = (answers: { all: unknown, unwatched: unknown } = search) => {
  const sent: Sent[] = []
  const actions = {
    session: { logged_in: false },
    execute: async (path: string, args: Record<string, unknown>) => {
      sent.push({ path, continuation: args.continuation })
      return Parser.parseResponse(answers.unwatched as never)
    },
  }
  const source = createYoutubeSource({
    fetch: globalThis.fetch,
    createClient: async () => ({ search: async () => new YT.Search(actions as never, Parser.parseResponse(answers.all as never), true) }) as never,
  })
  return { source, sent }
}

const videos = (results: { kind: string, id?: string }[]) => results.filter((result) => result.kind === 'video')

describe('the related column\'s marks', () => {
  it('reads the New badge off the top corner of the still that carries it', () => {
    expect(relatedRows().map(({ id, thumbnailBadge }) => ({ id, thumbnailBadge }))).toEqual([
      { id: SONG, thumbnailBadge: undefined },
      { id: NEW_UPLOAD, thumbnailBadge: 'New' },
    ])
  })

  it('marks a song by the music note its length badge carries, not by its title', () => {
    expect(relatedRows().map(({ id, durationSeconds, isMusic }) => ({ id, durationSeconds, isMusic }))).toEqual([
      { id: SONG, durationSeconds: 204, isMusic: true },
      { id: NEW_UPLOAD, durationSeconds: 2124, isMusic: undefined },
    ])
    expect(relatedRows(without(related, 'icon'))[0]).toMatchObject({ id: SONG, durationSeconds: 204, isMusic: undefined })
  })

  // also pins this repo's youtubei.js patch, which keeps a metadata part's leading icon
  it('puts the play arrow before a view count whose part carries it', () => {
    expect(relatedRows().map(({ id, viewCount, viewCountIcon }) => ({ id, viewCount, viewCountIcon }))).toEqual([
      { id: SONG, viewCount: '208M', viewCountIcon: true },
      { id: NEW_UPLOAD, viewCount: '3.9M', viewCountIcon: true },
    ])
    expect(relatedRows(without(related, 'leadingIcon')).map((video) => video.viewCountIcon)).toEqual([undefined, undefined])
  })
})

describe('a search row\'s marks', () => {
  it('keeps the words youtube.com prints in bold in the snippet', async () => {
    const [official, bbc] = videos((await searchSource().source.search('never gonna give you up')).results)
    expect(official).toMatchObject({
      snippetRuns: [
        { text: 'The official video for “' },
        { text: 'Never Gonna Give You Up', bold: true },
        { text: '” by Rick Astley. Never: The Autobiography OUT NOW! Follow this link to get\u00a0...' },
      ],
    })
    expect((official as { snippetRuns?: { bold?: boolean }[] }).snippetRuns?.[0]?.bold).toBeUndefined()
    expect((bbc as { snippetRuns?: { bold?: boolean }[] }).snippetRuns?.some((run) => run.bold)).toBe(false)
  })

  it('marks a song by the music note on its length overlay', async () => {
    const [official] = videos((await searchSource().source.search('never gonna give you up')).results)
    expect(official).toMatchObject({ id: 'dQw4w9WgXcQ', durationSeconds: 214, isMusic: true })
    const plain = searchSource({ all: without(search.all, 'icon'), unwatched: search.unwatched })
    const [unmarked] = videos((await plain.source.search('never gonna give you up')).results)
    expect(unmarked).toMatchObject({ id: 'dQw4w9WgXcQ', durationSeconds: 214 })
    expect((unmarked as { isMusic?: boolean }).isMusic).toBeUndefined()
  })
})

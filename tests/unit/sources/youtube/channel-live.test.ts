import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser, YT } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import fixture from '../../fixtures/channel-live-mkbhd.json'

/* channel-live-mkbhd.json is MKBHD's Live tab browsed signed out on 2026-11-10 (English, United States), with the
   answers to its Popular sort, to its Members only chip, and to the Members only chip of the Popular answer, each cut to
   two streams and stripped of the header and of tracking, menu and palette fields. youtube.com draws the tab's bar as a
   Latest dropdown (Latest, Popular, Oldest) followed by the Members only and Public chips. */

const MKBHD = 'UCBJycsmduvYEL83R_U4JriQ'

type Answer = keyof typeof fixture

const walk = (node: unknown, visit: (node: Record<string, unknown>) => void) => {
  if (!node || typeof node !== 'object') return
  visit(node as Record<string, unknown>)
  for (const value of Object.values(node)) walk(value, visit)
}

// the continuation a chip or a dropdown row of an answer sends
const tokenOf = (answer: Answer, label: string) => {
  let token: string | undefined
  walk(fixture[answer], (node) => {
    const chip = node.chipViewModel as { text?: string, tapCommand?: unknown } | undefined
    const row = node.listItemViewModel as { title?: { content?: string } } | undefined
    if (chip?.text !== label && row?.title?.content !== label) return
    walk(chip?.tapCommand ?? row, (inner) => {
      token ??= (inner.continuationCommand as { token?: string } | undefined)?.token
    })
  })
  if (!token) throw new Error(`no ${label} in ${answer}`)
  return token
}

const ANSWERS: [Answer, string][] = [
  ['popular', tokenOf('latest', 'Popular')],
  ['members', tokenOf('latest', 'Members only')],
  ['popularMembers', tokenOf('popular', 'Members only')],
]

const liveSource = (latest: unknown = fixture.latest) => {
  const sent: Answer[] = []
  const actions = {
    session: { logged_in: false },
    execute: async (_path: string, args: Record<string, unknown>) => {
      const answer = ANSWERS.find(([, token]) => token === args.continuation)?.[0]
      if (!answer) throw new Error(`unrecorded continuation ${String(args.continuation)}`)
      sent.push(answer)
      return Parser.parseResponse(fixture[answer] as never)
    },
  }
  const source = createYoutubeSource({
    fetch: globalThis.fetch,
    createClient: async () => ({ getChannel: async () => new YT.Channel(actions as never, Parser.parseResponse(latest as never), true) }) as never,
  })
  return { source, sent }
}

const titles = (items: { title: string }[]) => items.map((video) => video.title)

describe('a channel\'s Live tab', () => {
  it('offers the sorts of its dropdown and the filters after it', async () => {
    const { source, sent } = liveSource()
    const page = await source.channel(MKBHD, 'LIVE')
    expect(page).toMatchObject({
      tab: 'LIVE',
      sortMenu: true,
      sortOptions: ['Latest', 'Popular', 'Oldest'],
      filterOptions: ['Members only', 'Public'],
    })
    expect(page.appliedSort).toBeUndefined()
    expect(page.appliedFilter).toBeUndefined()
    expect(titles(page.videos.items)).toEqual(['5 New Phone Updates + Giveaway Update!', 'Spooky LIVE Q&A'])
    expect(page.videos.items.map((video) => video.viewCountIcon)).toEqual([true, true])
    expect(sent).toEqual([])
  })

  it('sorts by a row of the dropdown', async () => {
    const { source, sent } = liveSource()
    const page = await source.channel(MKBHD, 'LIVE', 'Popular')
    expect(sent).toEqual(['popular'])
    expect(page).toMatchObject({ appliedSort: 'Popular', sortMenu: true })
    expect(titles(page.videos.items)).toEqual(['LG 77" Wallpaper TV Unboxing [LIVE]', 'The Road to 5,000,000! [LIVE]'])
  })

  it('applies a filter chip as itself, and asks nothing for the sort already applied', async () => {
    const { source, sent } = liveSource()
    const page = await source.channel(MKBHD, 'LIVE', 'Latest', undefined, undefined, 'Members only')
    expect(sent).toEqual(['members'])
    expect(page).toMatchObject({ appliedSort: 'Latest', appliedFilter: 'Members only' })
    expect(titles(page.videos.items)).toEqual(['May the 4th Be With You!', 'Members Only April Fitness Challenge!'])
  })

  it('sorts first, then applies the filter chip of the sorted answer, as youtube.com does', async () => {
    const { source, sent } = liveSource()
    const page = await source.channel(MKBHD, 'LIVE', 'Popular', undefined, undefined, 'Members only')
    expect(sent).toEqual(['popular', 'popularMembers'])
    expect(page).toMatchObject({ appliedSort: 'Popular', appliedFilter: 'Members only' })
    expect(titles(page.videos.items)).toEqual(['May the 4th Be With You!', 'Is This Thing On?'])
  })

  it('offers no sort menu when the dropdown carries no rows, and keeps the filters', async () => {
    const empty = structuredClone(fixture.latest)
    let emptied = 0
    walk(empty, (node) => {
      if (!Array.isArray(node.listItems)) return
      node.listItems = []
      emptied++
    })
    expect(emptied).toBe(1)
    const { source } = liveSource(empty)
    const page = await source.channel(MKBHD, 'LIVE')
    expect(page).toMatchObject({ sortMenu: false, sortOptions: [], filterOptions: ['Members only', 'Public'] })
  })

  it('ignores a filter the tab does not offer', async () => {
    const { source, sent } = liveSource()
    const page = await source.channel(MKBHD, 'LIVE', undefined, undefined, undefined, 'Unlisted')
    expect(sent).toEqual([])
    expect(page.appliedFilter).toBeUndefined()
  })
})

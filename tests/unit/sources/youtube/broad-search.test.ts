import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser, YT } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import fixture from '../../fixtures/search-minecraft.json'

/* search-minecraft.json is the signed-out search for "minecraft" captured on 2026-11-10, cut to two result rows, the
   two "People also search for" carousels that close its first page (four and three videos) and the topic card of the
   right column, whose five videos were all scheduled that day. It is stripped of tracking, playback and menu fields,
   and runs through the real upstream parser, so it fails without the youtubei.js patch in patches/ as much as without
   the normalizers. */

const parse = (response: unknown) => new YT.Search(undefined as never, Parser.parseResponse(response as never), true)

const search = async (response: unknown = fixture) => createYoutubeSource({
  fetch: globalThis.fetch,
  createClient: async () => ({ search: async () => parse(response) }) as never,
}).search('minecraft')

// the topic card as upstream sends it for a game whose videos are out rather than scheduled ("roblox", 2026-11-10)
const released = (): unknown => {
  const copy = structuredClone(fixture)
  const card = copy.contents.twoColumnSearchResultsRenderer.secondaryContents.secondarySearchContainerRenderer.contents[0]!
  const lists = card.universalWatchCardRenderer.sections[0]!.watchCardSectionSequenceRenderer.lists
  const row = lists[0]!.verticalWatchCardListRenderer.items[0]!.watchCardCompactVideoRenderer as Record<string, unknown>
  delete row.upcomingEventData
  row.subtitle = { simpleText: '301K • 3d ago' }
  row.lengthText = { accessibility: { accessibilityData: { label: '28 seconds' } }, simpleText: '0:28' }
  return copy
}

describe('a broad search', () => {
  it('keeps its "People also search for" carousels in place among the rows, with their cards', async () => {
    const { results } = await search()
    expect(results.map((result) => result.kind === 'shelf' ? result.title : result.kind))
      .toEqual(['video', 'video', 'Minecraft Addon', 'Minecraft backrooms'])
    const [addon, backrooms] = results.filter((result) => result.kind === 'shelf')
    expect(addon).toMatchObject({ subtitle: 'People also search for', horizontal: true, shorts: [] })
    expect(addon?.kind === 'shelf' && addon.videos.map((video) => video.id))
      .toEqual(['5LP8rAcpDGo', '7Qo-27gyiik', 'h-vf10hoOfg', 'u00eNCXwD0A'])
    expect(backrooms?.kind === 'shelf' && backrooms.videos.length).toBe(3)
    expect(addon?.kind === 'shelf' && addon.videos[0]).toMatchObject({
      title: 'Minecraft Bedrock FINALLY Has Its Own Aeronautics Mod! (Create Movement Addon)',
      viewCount: '95K',
      publishedText: '2w ago',
      durationSeconds: 1729,
      channel: {
        id: 'UCkjxZqW8zRi4rexA3TMvmrA',
        name: 'ECKOSOLDIER',
        isVerified: true,
        avatar: expect.stringMatching(/^https:\/\/yt3\.ggpht\.com\//),
      },
    })
  })

  it('reads the topic card of the right column: the game, its newest video and its scheduled ones', async () => {
    const { topic } = await search()
    expect(topic).toMatchObject({
      title: 'Minecraft',
      subtitle: 'Video game • Released: 2009',
      channelId: 'UCQvWX73GQygcwXOTSf_VDVg',
      hero: {
        id: '8JGY7vGkMX0',
        title: 'Introducing Minecraft Realms Pro',
        subtitle: 'Minecraft • 170K • 11h ago',
        thumbnail: expect.stringContaining('/vi/8JGY7vGkMX0/'),
      },
    })
    expect(topic?.videos.map((video) => video.id)).toEqual(['FA_rn1PKtZY', 'E1eJz7IC4Tk', 'dlkiaYFoYYc', 'HnDhqRVxqNo', 'xQFiGPrnM4Y'])
    expect(topic?.videos[0]).toEqual({
      id: 'FA_rn1PKtZY',
      title: 'The POW Show: Challenges & Trivia',
      thumbnail: expect.stringContaining('/vi/FA_rn1PKtZY/'),
      durationSeconds: undefined,
      subtitle: undefined,
      channel: { id: 'UC1sELGmy5jp5fQUugmuYlXQ', name: 'Minecraft' },
      scheduledAt: '2026-11-16T00:00:00.000Z',
    })
  })

  it('reads a topic video that is out by its length and its views and date', async () => {
    const { topic } = await search(released())
    expect(topic?.videos[0]).toMatchObject({ id: 'FA_rn1PKtZY', durationSeconds: 28, subtitle: '301K • 3d ago', scheduledAt: undefined })
    expect(topic?.videos).toHaveLength(5)
  })

  it('has no topic when the answer has no right column', async () => {
    const { contents: { twoColumnSearchResultsRenderer: { primaryContents } }, ...rest } = fixture
    const { topic, results } = await search({ ...rest, contents: { twoColumnSearchResultsRenderer: { primaryContents } } })
    expect(topic).toBeUndefined()
    expect(results).toHaveLength(4)
  })
})

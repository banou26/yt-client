import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import { normalizeWatchMeta } from '../../../../src/sources/youtube/normalize'
import fixture from '../../fixtures/transcript-panel.json'

/* transcript-panel.json holds youtube.com's signed-out answers of 2026-11-10, stripped of tracking fields: the
   description's transcript section off the watch pages of g6Die8gVFn0 (six chapters) and dQw4w9WgXcQ (none), their
   get_panel answers cut to a few lines, and the answers to a search for "OLED" and for a word the video never says. */

const panelOf = (next: unknown) =>
  normalizeWatchMeta({ ...Parser.parseResponse(next as never), contents_memo: new Map() }, 'g6Die8gVFn0')?.transcriptPanel

const sourceAnswering = (data: unknown) => {
  const calls: unknown[] = []
  const source = createYoutubeSource({
    fetch: globalThis.fetch,
    createClient: async () => ({
      actions: {
        execute: async (endpoint: string, args: unknown) => {
          calls.push({ endpoint, args })
          return { data }
        },
      },
    }) as never,
  })
  return { source, calls }
}

describe('watch transcript panel', () => {
  it('reads the panel and params the description\'s Show transcript sends, with chapters and without, and none without it', () => {
    expect(panelOf(fixture.nextChapters)).toEqual({ panelId: 'PAmodern_transcript_view', params: 'qgkPCgtnNkRpZThnVkZuMBgB' })
    expect(panelOf(fixture.nextPlain)).toEqual({ panelId: 'PAmodern_transcript_view', params: 'qgkPCgtkUXc0dzlXZ1hjURgC' })
    expect(panelOf({})).toBeUndefined()
  })
})

describe('transcript', () => {
  it('asks get_panel for the panel, and lists its lines by chapter from the time youtube.com prints, each heading with its chapter\'s start', async () => {
    const { source, calls } = sourceAnswering(fixture.panelChapters)
    const transcript = await source.transcript('PAmodern_transcript_view', 'qgkPCgtnNkRpZThnVkZuMBgB')
    expect(calls).toEqual([{ endpoint: '/get_panel', args: { panelId: 'PAmodern_transcript_view', params: 'qgkPCgtnNkRpZThnVkZuMBgB' } }])
    expect(transcript.sections.map(section => [section.title, section.startSeconds])).toEqual([
      ['Chapter 1: Hardware and performance', 0],
      ['Chapter 2: Pricing and restrictions', 161],
    ])
    expect(transcript.sections[0]!.lines.map(line => [line.startSeconds, line.timestamp])).toEqual([[5, '0:05'], [13, '0:13'], [22, '0:22']])
    expect(transcript.sections[1]!.lines[0]).toEqual({
      startSeconds: 169,
      timestamp: '2:49',
      text: 'I don\'t know how else to say it. It\'s the most Apple product we\'ve seen in a long time. So I guess let\'s just start with the price.',
    })
    expect(transcript.searchToken).toBe('kta-ngs-EhhQQW1vZGVybl90cmFuc2NyaXB0X3ZpZXcaInFna1VDZ3RuTmtScFpUaG5Wa1p1TUJnQk1nTXVaVzQlM0Q%3D')
  })

  it('lists a video without chapters as one untitled section', async () => {
    const transcript = await sourceAnswering(fixture.panelPlain).source.transcript('PAmodern_transcript_view', 'qgkPCgtkUXc0dzlXZ1hjURgC')
    expect(transcript.sections).toHaveLength(1)
    expect(transcript.sections[0]!.title).toBeUndefined()
    expect(transcript.sections[0]!.startSeconds).toBeUndefined()
    expect(transcript.sections[0]!.lines.map(line => [line.startSeconds, line.text])).toEqual([
      [1, '[♪♪♪]'],
      [18, '♪ We\'re no strangers to love ♪ ♪ You know the rules and so do I ♪'],
      [27, '♪ A full commitment\'s what I\'m thinking of ♪ ♪ You wouldn\'t get this from any other guy ♪'],
    ])
  })

  it('searches through get_panel\'s continuation, and reads the lines its answer reloads', async () => {
    const { source, calls } = sourceAnswering(fixture.search)
    const found = await source.transcriptSearch('kta-ngs-token', 'OLED')
    expect(calls).toEqual([{
      endpoint: '/get_panel',
      args: { continuation: 'kta-ngs-token', formData: { searchInputFormData: { query: 'OLED' } } },
    }])
    expect(found.sections.map(section => [section.title, section.startSeconds, section.lines.map(line => line.timestamp)])).toEqual([
      ['Chapter 1: Hardware and performance', 0, ['0:59', '1:00', '2:07']],
      ['Chapter 2: The 60Hz display debate', 347, ['5:47', '6:31']],
      // youtube.com numbers the chapters the results fall in, so the fifth chapter heads its third section
      ['Chapter 3: Usage and impressions', 578, ['11:32']],
    ])
    expect(found.searchToken).toBeUndefined()
  })

  it('has no lines when nothing matches', async () => {
    expect(await sourceAnswering(fixture.noResults).source.transcriptSearch('kta-ngs-token', 'zzqqxxnothing')).toEqual({ sections: [], searchToken: undefined })
  })
})

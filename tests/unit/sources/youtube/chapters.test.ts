import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser } from 'youtubei.js'

import { normalizeWatchMeta } from '../../../../src/sources/youtube/normalize'

/* The player overlay of jNQXAC9IVRw's /next, captured on 2026-11-05 and reduced to its chapter markers. Runs the real
   upstream parser, since the overlay comes back wrapped rather than in contents_memo. */
const stillUrl = (millis: number, width: number) => `https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault_${millis}.jpg?w=${width}`
const still = (millis: number) => ({
  thumbnails: [{ url: stillUrl(millis, 168), width: 168, height: 94 }, { url: stillUrl(millis, 336), width: 336, height: 188 }],
})

const overlay = (key: string) => ({
  playerOverlayRenderer: {
    decoratedPlayerBarRenderer: {
      decoratedPlayerBarRenderer: {
        playerBar: {
          multiMarkersPlayerBarRenderer: {
            visibleOnLoad: { key },
            markersMap: [{
              key,
              value: {
                chapters: [
                  { chapterRenderer: { title: { simpleText: 'Intro' }, timeRangeStartMillis: 0, thumbnail: still(0) } },
                  { chapterRenderer: { title: { simpleText: 'The cool thing' }, timeRangeStartMillis: 5000, thumbnail: still(5000) } },
                  { chapterRenderer: { title: { simpleText: 'End' }, timeRangeStartMillis: 17000, thumbnail: still(17000) } },
                ],
              },
            }],
          },
        },
      },
    },
  },
})

const chaptersOf = (playerOverlays?: unknown) =>
  normalizeWatchMeta({ ...Parser.parseResponse({ playerOverlays } as never), contents_memo: new Map() }, 'jNQXAC9IVRw')?.chapters

describe('watch chapters', () => {
  it('reads the chapters off the player bar, in order, from their start, with the widest still', () => {
    const chapters = [
      { title: 'Intro', startSeconds: 0, thumbnail: stillUrl(0, 336) },
      { title: 'The cool thing', startSeconds: 5, thumbnail: stillUrl(5000, 336) },
      { title: 'End', startSeconds: 17, thumbnail: stillUrl(17000, 336) },
    ]
    expect(chaptersOf(overlay('DESCRIPTION_CHAPTERS'))).toEqual(chapters)
    expect(chaptersOf(overlay('AUTO_CHAPTERS'))).toEqual(chapters)
  })

  it('is empty for a video without chapters', () => {
    expect(chaptersOf()).toEqual([])
    expect(chaptersOf({ playerOverlayRenderer: {} })).toEqual([])
  })
})

import type { RefObject } from 'preact'

import type { TranscriptPanel as TranscriptArgs } from '../generated/graphql'
import type { PlayerChapter } from '../player/chapters'
import type { VideoPanel } from '../player/session'

import { setPanel } from '../player/session'
import { ChaptersPanel } from './chapters'
import { TranscriptPanel } from './transcript'

/**
 * The list open beside the player, or over it in full screen (`overlay`): the chapters or the transcript, undefined
 * when `open` names a list the video has not got. With both, youtube.com heads it "In this video", with a chip each.
 */
export const watchPanel = (
  { videoId, open, chapters, chapter, transcript, overlay, fit }: {
    videoId: string
    open?: VideoPanel
    chapters: readonly PlayerChapter[]
    chapter: number
    transcript?: TranscriptArgs
    overlay?: boolean
    fit?: RefObject<HTMLElement | null>
  },
) => {
  const both = chapters.length > 0 && transcript !== undefined
  const chips = both
    ? (['chapters', 'transcript'] as const).map(panel => (
      <button type='button' key={panel} role='tab' className='panel-chip' aria-selected={open === panel} onClick={() => setPanel(panel)}>
        {panel === 'chapters' ? 'Chapters' : 'Transcript'}
      </button>
    ))
    : undefined
  const heading = both ? 'In this video' : undefined
  const close = () => setPanel(undefined)
  if (open === 'transcript' && transcript) {
    return (
      <TranscriptPanel
        key={`transcript:${videoId}`}
        videoId={videoId}
        panel={transcript}
        heading={heading}
        chips={chips}
        onClose={close}
        overlay={overlay}
        fit={fit}
      />
    )
  }
  if (open === 'chapters' && chapters.length > 0) {
    return (
      <ChaptersPanel
        key={`chapters:${videoId}`}
        videoId={videoId}
        chapters={chapters}
        current={chapter}
        heading={heading}
        chips={chips}
        onClose={close}
        overlay={overlay}
        fit={fit}
      />
    )
  }
  return undefined
}

import type { ComponentChildren, RefObject, TargetedEvent, TargetedPointerEvent } from 'preact'

import type { PlayerChapter } from '../player/chapters'
import type { VideoPanel } from '../player/session'

import { css } from '@emotion/react'
import { X } from 'lucide-react'
import { Fragment } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useQuery } from 'urql'

import { gql } from '../generated'
import { chapterIndexAt } from '../player/chapters'
import { playheadOf, seekTo } from '../player/seek'
import { setPanel } from '../player/session'
import { ChaptersPanel } from './chapters'
import { readable } from './format'
import { SidePanel } from './side-panel'

const TRANSCRIPT_QUERY = gql(`
  query Transcript($panelId: String!, $params: String!) {
    transcript(panelId: $panelId, params: $params) {
      searchToken
      sections { title lines { startSeconds timestamp text } }
    }
  }
`)

const TRANSCRIPT_SEARCH_QUERY = gql(`
  query TranscriptSearch($token: String!, $query: String!) {
    transcriptSearch(token: $token, query: $query) {
      sections { title lines { startSeconds timestamp text } }
    }
  }
`)

// youtube.com keeps the line playing a tenth of the way down the list (its answer's selectedItemAlignmentPercentOffset)
const ALIGN = 0.1
const TICK_MS = 250

export type TranscriptPanelArgs = { panelId: string, params: string }

const style = css`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  .transcript-search {
    flex: none;
    display: flex;
    align-items: center;
    height: 4.2rem;
    margin: 0.8rem 1.6rem 0.2rem;
    padding: 0 0.4rem 0 1.2rem;
    border-radius: 10rem;
    background: var(--bg-chip);
  }

  .transcript-search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 1.6rem;
    line-height: 2.2rem;
  }

  .transcript-search input::placeholder {
    color: var(--text-secondary);
  }

  .transcript-clear {
    display: grid;
    place-items: center;
    width: 3.6rem;
    height: 3.6rem;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
  }

  .transcript-clear:hover {
    background: var(--bg-hover);
  }

  .transcript-lines {
    position: relative;
    flex: 1;
    min-height: 0;
    padding: 0 0.8rem;
    overflow-y: auto;
  }

  .transcript-chapter {
    padding: 0.8rem 2.4rem 0.8rem 0.8rem;
    font-size: 2rem;
    font-weight: 700;
    line-height: 2.8rem;
  }

  .transcript-line {
    display: block;
    width: 100%;
    padding: 0.8rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.8rem;
    font-weight: 500;
    line-height: 2.6rem;
    text-align: left;
    cursor: pointer;
  }

  .transcript-line:hover {
    background: var(--bg-hover);
  }

  .transcript-line[aria-current='true'] {
    color: var(--text-primary);
  }

  .transcript-time {
    display: inline-block;
    margin-right: 0.8rem;
    padding: 0.2rem 0.6rem;
    border-radius: 10rem;
    background: var(--bg-hover);
    color: var(--text-secondary);
    font-size: 1.2rem;
    line-height: 1.8rem;
    font-variant-numeric: tabular-nums;
  }

  .transcript-line[aria-current='true'] .transcript-time {
    background: var(--transcript-tint);
    color: var(--transcript-tint-text);
  }

  .transcript-empty {
    padding: 0.8rem;
    color: var(--text-secondary);
  }

  .transcript-sync {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    height: 4rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 2rem;
    background: var(--bg-inverse);
    color: var(--text-inverse);
    font-size: 1.4rem;
    font-weight: 500;
    white-space: nowrap;
    transform: translateX(-50%);
    cursor: pointer;
  }
`

/**
 * youtube.com's transcript panel: the spoken text by chapter, the line playing highlighted and kept in view, a line
 * seeking to itself, and a search through youtube.com's own. Scrolling the list stops it following the video until
 * "Sync to video time" or a line is pressed.
 */
export const TranscriptPanel = (
  { videoId, panel, heading = 'Transcript', chips, onClose, overlay = false, fit }: {
    videoId: string
    panel: TranscriptPanelArgs
    heading?: string
    chips?: ComponentChildren
    onClose: () => void
    overlay?: boolean
    fit?: RefObject<HTMLElement | null>
  },
) => {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [{ data, error }] = useQuery({ query: TRANSCRIPT_QUERY, variables: { panelId: panel.panelId, params: panel.params } })
  const token = data?.transcript.searchToken ?? undefined
  const searching = query !== '' && token !== undefined
  const [{ data: found, error: searchError, operation }] = useQuery({
    query: TRANSCRIPT_SEARCH_QUERY,
    variables: { token: token ?? '', query },
    pause: !searching,
  })
  // urql holds the previous search's answer while the next one is in flight
  const transcript = searching
    ? operation?.variables.query === query ? found?.transcriptSearch : undefined
    : data?.transcript
  const failure = searching ? searchError : error
  const lines = useMemo(() => transcript?.sections.flatMap(section => section.lines) ?? [], [transcript])

  const [active, setActive] = useState(-1)
  useEffect(() => {
    const tick = () => setActive(chapterIndexAt(lines, playheadOf(videoId) ?? -1))
    tick()
    const timer = setInterval(tick, TICK_MS)
    return () => clearInterval(timer)
  }, [videoId, lines])

  const listRef = useRef<HTMLDivElement>(null)
  const [following, setFollowing] = useState(true)
  const placed = useRef(false)
  useLayoutEffect(() => {
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>('.transcript-line[aria-current="true"]')
    if (!following || !list || !row) return
    list.scrollTo({ top: row.offsetTop - list.clientHeight * ALIGN, behavior: placed.current ? 'smooth' : 'instant' })
    placed.current = true
  }, [active, following, lines])
  const detach = () => setFollowing(false)

  let position = 0
  return (
    <SidePanel label='Transcript' heading={heading} chips={chips} onClose={onClose} overlay={overlay} fit={fit} className='transcript-panel'>
      <div css={style} className='transcript-body'>
        {token
          ? (
            <form
              className='transcript-search'
              role='search'
              onSubmit={(event: TargetedEvent<HTMLFormElement>) => {
                event.preventDefault()
                setQuery(draft.trim())
                setFollowing(true)
              }}
            >
              <input
                type='text'
                aria-label='Search transcript'
                placeholder='Search transcript'
                value={draft}
                onInput={(event: TargetedEvent<HTMLInputElement>) => setDraft(event.currentTarget.value)}
              />
              {draft
                ? (
                  <button
                    type='button'
                    className='transcript-clear'
                    aria-label='Clear'
                    onClick={() => {
                      setDraft('')
                      setQuery('')
                    }}
                  >
                    <X size={24} strokeWidth={1.5} />
                  </button>
                )
                : undefined}
            </form>
          )
          : undefined}
        <div
          className='transcript-lines'
          ref={listRef}
          onWheel={detach}
          onTouchMove={detach}
          // a press on the list itself rather than on a line is a press on its scrollbar
          onPointerDown={(event: TargetedPointerEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget) detach()
          }}
        >
          {transcript?.sections.map((section, index) => (
            <Fragment key={index}>
              {section.title ? <h3 className='transcript-chapter'>{section.title}</h3> : undefined}
              {section.lines.map((line) => {
                const at = position++
                return (
                  <button
                    type='button'
                    key={at}
                    className='transcript-line'
                    aria-current={at === active ? 'true' : undefined}
                    onClick={() => {
                      seekTo(videoId, line.startSeconds, false)
                      setActive(at)
                      setFollowing(true)
                    }}
                  >
                    <span className='transcript-time'>{line.timestamp}</span>
                    {line.text}
                  </button>
                )
              })}
            </Fragment>
          ))}
          {transcript && lines.length === 0 ? <p className='transcript-empty'>No results found.</p> : undefined}
          {failure && !transcript ? <p className='transcript-empty'>{readable(failure.message)}</p> : undefined}
        </div>
        {following
          ? undefined
          : <button type='button' className='transcript-sync' onClick={() => setFollowing(true)}>Sync to video time</button>}
      </div>
    </SidePanel>
  )
}

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
    transcript?: TranscriptPanelArgs
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

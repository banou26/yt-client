import type { WatchMetaQuery } from '../generated/graphql'
import type { PlayerChapter } from '../player/chapters'
import type { RichTextRun } from './rich-text'

import { css } from '@emotion/react'
import { ArrowUpRight, Music2, SquarePlay, SquareUser } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { Link } from 'wouter'

import { registerCards } from '../player/cards'
import { seekTo } from '../player/seek'
import { ChapterCards } from './chapters'
import { descriptionMeta } from './format'
import { Rail } from './rail'
import { RichText } from './rich-text'
import { Thumbnail } from './thumbnail'
import { watchHrefFor } from './video-card'

type Watch = NonNullable<WatchMetaQuery['watch']>
type Song = NonNullable<Watch['music']>['songs'][number]
type InfoCard = NonNullable<Watch['channelCard']>['cards'][number]

const LINES = 3
// youtube.com's description panel in full screen cuts the text at 400 px, and puts Show less 20 px under it (measured 2026-11-10)
const PANEL_LINES = 20
const MORE_GAP = 4
const FADE = 24

const style = css`
  margin-top: 1.2rem;
  padding: 1.2rem;
  border-radius: 1.2rem;
  background: var(--bg-hover);
  font-size: 1.4rem;
  line-height: 2rem;
  color: var(--text-primary);
  transition: background 0.15s ease;

  &.collapsed {
    cursor: pointer;
  }

  &.collapsed:hover {
    background: var(--bg-hover-strong);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: 0.8rem;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .counts {
    white-space: pre-wrap;
  }

  .hashtag {
    color: var(--text-secondary);
  }

  .snippet {
    position: relative;
  }

  .text {
    display: block;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Cut by height rather than a line clamp: a clamp draws its own
     ellipsis on the last kept line, which is a lone one when that line is blank.
     The mask hides the last line from where the inline button starts, fading
     the text it cuts, so it reads on the translucent box in either theme. */
  .clamped .text {
    max-height: ${LINES * 2}rem;
    overflow: hidden;
    mask-image:
      linear-gradient(to top, transparent 2rem, #000 2rem),
      linear-gradient(to right, #000 var(--fade-from, 0), transparent var(--more-left, 0));
  }

  .more {
    position: absolute;
    left: var(--more-left, auto);
    bottom: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }

  /* youtube.com pads each section 16px above and below */
  .chapters,
  .music,
  .transcript,
  .channel-card {
    padding: 1.6rem 0;
  }

  .chapters-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.2rem;
    margin-bottom: 0.4rem;
  }

  .chapters-heading {
    font-size: 2rem;
    font-weight: 700;
    line-height: 2.8rem;
  }

  .view-all {
    flex: none;
    height: 4rem;
    padding: 0 1.5rem;
    border: 1px solid var(--border-subtle);
    border-radius: 2rem;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .view-all:hover {
    background: var(--bg-hover);
  }

  .show-transcript {
    display: block;
    margin-top: 1.6rem;
    color: var(--accent);
  }

  .show-transcript:hover {
    background: var(--accent-hover);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
  }

  .music-count,
  .song-line,
  .channel-subs {
    display: block;
    color: var(--text-secondary);
    font-size: 1.2rem;
    line-height: 1.8rem;
  }

  .songs {
    margin-top: 0.4rem;
    --rail-gap: 1.2rem;
    --rail-arrow-top: 6.2rem;
  }

  .song {
    display: block;
    width: 16.4rem;
    color: var(--text-primary);
  }

  .song-thumb,
  .channel-avatar {
    display: block;
    flex: none;
    overflow: hidden;
    background: var(--bg-chip);
  }

  .song-thumb {
    width: 16.4rem;
    height: 16.4rem;
    border-radius: 0.8rem;
  }

  .song-thumb img,
  .channel-avatar img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .song-details {
    display: block;
    min-width: 0;
    padding-top: 0.4rem;
  }

  .song-title {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .song-line {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* youtube.com lays a lone song beside its cover, and several under theirs in a row */
  .songs.single .song {
    display: flex;
    gap: 1.6rem;
    width: auto;
  }

  .songs.single .song-details {
    padding-top: 0;
  }

  .music-channel {
    justify-content: center;
    width: 32.8rem;
    max-width: 100%;
    margin-top: 2rem;
  }

  .channel-head {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    margin-bottom: 1.6rem;
  }

  .channel-avatar {
    width: 3.6rem;
    height: 3.6rem;
    border-radius: 50%;
  }

  .channel-name {
    display: block;
    font-size: 2rem;
    font-weight: 600;
    line-height: 2.6rem;
  }

  .channel-links {
    --rail-gap: 0.8rem;
    --rail-arrow-top: 0;
  }

  /* youtube.com glides the cards up until they end 24 px above the bottom (measured 2026-11-10); cards above the
     page's top land under the masthead */
  .channel-card {
    scroll-margin: var(--header-height) 0 2.4rem;
  }

  /* youtube.com's info cards, measured 2026-11-10: rows 64 px tall and 12 px apart, a 112 px wide picture with a
     channel's 64 px avatar in its middle, and the text 16 px after it, the title on one line */
  .info-cards {
    display: grid;
    gap: 1.2rem;
    margin-top: 1.6rem;
  }

  .info-card {
    display: flex;
    align-items: center;
    gap: 1.6rem;
    height: 6.4rem;
    color: var(--text-primary);
  }

  .card-thumb {
    position: relative;
    flex: none;
    width: 11.2rem;
    height: 6.4rem;
    overflow: hidden;
    border-radius: 0.8rem;
    background: var(--bg-chip);
  }

  .card-thumb.round {
    width: 6.4rem;
    margin: 0 2.4rem;
    border-radius: 50%;
  }

  .card-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-duration {
    position: absolute;
    right: 0.4rem;
    bottom: 0.4rem;
    padding: 0 0.4rem;
    border-radius: 0.4rem;
    background: var(--bg-badge);
    color: #ffffff;
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.8rem;
  }

  .card-text {
    min-width: 0;
  }

  .card-title {
    display: -webkit-box;
    overflow: hidden;
    font-weight: 500;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
  }

  .card-subtitle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--text-secondary);
    font-size: 1.2rem;
    line-height: 1.8rem;
  }

  .less {
    display: block;
    margin-top: 1.6rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }
`

const panelStyle = css`
  .clamped .text {
    max-height: ${PANEL_LINES * 2}rem;
  }

  .less {
    margin-top: 2rem;
  }
`

/* youtube.com's inline ...more: right after the text of the last line shown, or at the end of that line, over its
   faded text, when the line is full. Returns whether the text runs past `limit` lines. */
const placeMore = (snippet: HTMLElement, limit: number) => {
  const text = snippet.querySelector<HTMLElement>('.text')
  if (!text) return false
  const lineHeight = Number.parseFloat(getComputedStyle(text).lineHeight)
  const total = Math.round(text.scrollHeight / lineHeight)
  const more = snippet.querySelector<HTMLElement>('.more')
  if (!more) return total > limit
  const box = text.getBoundingClientRect()
  const lines = Math.max(1, Math.min(limit, total))
  const lineTop = box.top + (lines - 1) * lineHeight
  const range = document.createRange()
  range.selectNodeContents(text)
  const end = Math.max(0, ...[...range.getClientRects()]
    .filter(rect => rect.width > 0 && rect.top + rect.height / 2 >= lineTop && rect.top + rect.height / 2 < lineTop + lineHeight)
    .map(rect => rect.right - box.left))
  const last = box.width - more.offsetWidth
  const left = Math.min(end + MORE_GAP, last)
  snippet.style.setProperty('--more-left', `${left}px`)
  snippet.style.setProperty('--fade-from', `${left < end + MORE_GAP ? left - FADE : left}px`)
  return total > limit
}

export const DescriptionBox = (
  {
    viewCountText, publishedDateText, shortViewCountText, relativeDateText, hashtags = [],
    description, runs, videoId, chapters = [], currentChapter = -1, onViewChapters, onShowTranscript, music, channelCard, open = false,
  }: {
    viewCountText?: string | null
    publishedDateText?: string | null
    shortViewCountText?: string | null
    relativeDateText?: string | null
    hashtags?: readonly string[]
    description?: string | null
    runs?: readonly RichTextRun[]
    videoId?: string
    chapters?: readonly PlayerChapter[]
    currentChapter?: number
    onViewChapters?: () => void
    // set for a video with a transcript, which youtube.com's expanded description offers under the chapters
    onShowTranscript?: () => void
    music?: Watch['music']
    channelCard?: Watch['channelCard']
    /* youtube.com's description panel in full screen: every section listed, and the text cut at 20 lines, with ...more
       only when it runs longer and Show less right under it */
    open?: boolean
  },
) => {
  const [expanded, setExpanded] = useState(false)
  // the panel's text fits its 20 lines, so it offers no ...more
  const [fits, setFits] = useState(false)
  const full = expanded || open
  const clamped = !expanded && !(open && fits)
  const snippetRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  const [revealed, setRevealed] = useState(0)
  useEffect(() => {
    if (!channelCard || open) return
    return registerCards(() => {
      setExpanded(true)
      setRevealed(count => count + 1)
    })
  }, [channelCard, open])
  useEffect(() => {
    if (revealed > 0) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [revealed])
  useLayoutEffect(() => {
    const snippet = snippetRef.current
    if (expanded || !snippet) return
    const place = () => {
      const long = placeMore(snippet, open ? PANEL_LINES : LINES)
      if (open) setFits(!long)
    }
    place()
    // a box of fixed height and width does not resize when the web font swaps in and the lines rewrap
    void document.fonts.ready.then(place)
    const observer = new ResizeObserver(place)
    observer.observe(snippet)
    return () => observer.disconnect()
  }, [expanded, description, runs, open])
  const expand = () => setExpanded(true)
  const less = <button type='button' className='less' onClick={() => setExpanded(false)}>Show less</button>
  const counts = descriptionMeta({ expanded: full, viewCountText, shortViewCountText, publishedDateText, relativeDateText })
  return (
    <div
      css={open ? [style, panelStyle] : style}
      className={full ? undefined : 'collapsed'}
      onClick={full ? undefined : expand}
    >
      {counts || hashtags.length > 0
        ? (
          <div className='meta'>
            {counts ? <span className='counts'>{counts}</span> : undefined}
            {hashtags.map(tag => (
              <Link key={tag} className='hashtag' href={`/results?${new URLSearchParams({ search_query: tag })}`}>{tag}</Link>
            ))}
          </div>
        )
        : undefined}
      {description
        ? (
          <div className={clamped ? 'snippet clamped' : 'snippet'} ref={snippetRef} onClick={open && clamped ? expand : undefined}>
            {runs && runs.length > 0
              ? <RichText className='text' runs={runs} videoId={videoId} />
              : <div className='text'>{description}</div>}
            {clamped ? <button type='button' className='more'>...more</button> : undefined}
          </div>
        )
        : undefined}
      {description && expanded && open ? less : undefined}
      {full && videoId && chapters.length > 0
        ? (
          <section className='chapters' aria-label='Chapters'>
            <div className='chapters-head'>
              <h2 className='chapters-heading'>Chapters</h2>
              {onViewChapters
                ? (
                  <button
                    type='button'
                    className='view-all'
                    onClick={() => {
                      onViewChapters()
                      scrollTo({ top: 0 })
                    }}
                  >
                    View all
                  </button>
                )
                : undefined}
            </div>
            <ChapterCards
              videoId={videoId}
              chapters={chapters}
              current={currentChapter}
              onSeek={(seconds: number) => {
                seekTo(videoId, seconds)
                scrollTo({ top: 0 })
              }}
            />
          </section>
        )
        : undefined}
      {full && music
        ? (
          <section className='music' aria-label='Music'>
            <h2 className='chapters-heading'>Music</h2>
            {music.countText ? <span className='music-count'>{music.countText}</span> : undefined}
            {music.songs.length === 1
              ? <div className='songs single'><SongCard song={music.songs[0]!} /></div>
              : (
                <div className='songs'>
                  <Rail label='songs' count={music.songs.length}>
                    {music.songs.map((song, index) => <SongCard key={`${index}:${song.title}`} song={song} />)}
                  </Rail>
                </div>
              )}
            {music.channelId
              ? (
                <Link className='view-all pill music-channel' href={`/channel/${music.channelId}`}>
                  <Music2 size={24} strokeWidth={1.5} />
                  Music
                </Link>
              )
              : undefined}
          </section>
        )
        : undefined}
      {full && onShowTranscript
        ? (
          <section className='transcript' aria-label='Transcript'>
            <h2 className='chapters-heading'>Transcript</h2>
            <button
              type='button'
              className='view-all show-transcript'
              onClick={() => {
                onShowTranscript()
                scrollTo({ top: 0 })
              }}
            >
              Show transcript
            </button>
          </section>
        )
        : undefined}
      {full && channelCard
        ? (
          <section className='channel-card' aria-label='Channel' ref={cardRef}>
            <Link className='channel-head' href={`/channel/${channelCard.id}`}>
              <span className='channel-avatar'>{channelCard.avatar ? <Thumbnail src={channelCard.avatar} /> : undefined}</span>
              <span>
                <span className='channel-name'>{channelCard.name}</span>
                {channelCard.subscriberCountText ? <span className='channel-subs'>{channelCard.subscriberCountText}</span> : undefined}
              </span>
            </Link>
            <div className='channel-links'>
              <Rail label='links' count={channelCard.links.length}>
                {channelCard.videosUrl
                  ? <Link className='view-all pill' href={channelCard.videosUrl}><SquarePlay size={24} strokeWidth={1.5} />Videos</Link>
                  : undefined}
                {channelCard.aboutUrl
                  ? <Link className='view-all pill' href={channelCard.aboutUrl}><SquareUser size={24} strokeWidth={1.5} />About</Link>
                  : undefined}
                {channelCard.links.map(link => (
                  <a key={link.url} className='view-all pill' href={link.url} target='_blank' rel='noreferrer noopener'>{link.title}</a>
                ))}
              </Rail>
            </div>
            {channelCard.cards.length > 0
              ? <div className='info-cards'>{channelCard.cards.map((card, index) => <InfoCardRow key={index} card={card} />)}</div>
              : undefined}
          </section>
        )
        : undefined}
      {description && expanded && !open ? less : undefined}
    </div>
  )
}

const InfoCardRow = ({ card }: { card: InfoCard }) => {
  const body = (
    <>
      <span className={card.channelId ? 'card-thumb round' : 'card-thumb'}>
        {card.thumbnail ? <Thumbnail src={card.thumbnail} /> : undefined}
        {card.duration ? <span className='card-duration'>{card.duration}</span> : undefined}
      </span>
      <span className='card-text'>
        <span className='card-title'>{card.title}</span>
        {card.subtitle
          ? <span className='card-subtitle'>{card.subtitle}{card.url ? <ArrowUpRight size={12} strokeWidth={2} aria-hidden='true' /> : undefined}</span>
          : undefined}
      </span>
    </>
  )
  if (card.url) return <a className='info-card' href={card.url} target='_blank' rel='noreferrer noopener'>{body}</a>
  return <Link className='info-card' href={card.videoId ? watchHrefFor(card.videoId) : `/channel/${card.channelId}`}>{body}</Link>
}

const SongCard = ({ song }: { song: Song }) => {
  const body = (
    <>
      <span className='song-thumb'>{song.thumbnail ? <Thumbnail src={song.thumbnail} /> : undefined}</span>
      <span className='song-details'>
        <span className='song-title'>{song.title}</span>
        {song.artist ? <span className='song-line'>{song.artist}</span> : undefined}
        {song.album ? <span className='song-line'>{song.album}</span> : undefined}
      </span>
    </>
  )
  return song.videoId
    ? <Link className='song' href={watchHrefFor(song.videoId)}>{body}</Link>
    : <div className='song'>{body}</div>
}

export default DescriptionBox

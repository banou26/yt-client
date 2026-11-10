import type { EndScreenElement } from '../frame/protocol'
import type { Picture } from './end-screen-layout'
import type { UpNext } from './up-next'

import { css } from '@emotion/react'
import { Eye, EyeOff, Link as LinkIcon, ListVideo } from 'lucide-react'
import { useEffect, useState } from 'preact/hooks'
import { useMutation } from 'urql'

import { readable } from '../components/format'
import { SET_SUBSCRIBED } from '../components/subscribe-button'
import { showToast } from '../components/ui/toast'
import { useSession } from '../session'
import { signIn } from '../sign-in'
import { openOnClick, upNextHref } from './end-screen'
import { pictureOf, placeElement } from './end-screen-layout'

// the elements and their images load this long before they are due rather than with the video, which most never play to
const PRELOAD_MS = 10_000

const usePicture = (video: HTMLVideoElement) => {
  const [picture, setPicture] = useState(() => pictureOf(video))
  useEffect(() => {
    const update = () => setPicture((previous) => {
      const next = pictureOf(video)
      return Object.keys(next).every(key => next[key as keyof Picture] === previous[key as keyof Picture]) ? previous : next
    })
    const observer = new ResizeObserver(update)
    observer.observe(video)
    // `resize` fires when the stream's own size changes, which the element's box does not show
    video.addEventListener('resize', update)
    video.addEventListener('loadedmetadata', update)
    update()
    return () => {
      observer.disconnect()
      video.removeEventListener('resize', update)
      video.removeEventListener('loadedmetadata', update)
    }
  }, [video])
  return picture
}

// youtube.com sizes the text for the player class nearest the picture's width (346 to 1920), so each step starts halfway between two classes
const style = css`
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: Roboto, Arial, sans-serif;

  .picture {
    position: absolute;
    container: end-screen / inline-size;
    font-size: 12px;
    line-height: 1.3em;
  }

  .element {
    position: absolute;
    z-index: 0;
    display: block;
    box-sizing: content-box;
    margin: -1px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
    color: #ffffff;
    text-decoration: none;
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    transition: visibility linear 0.2s, opacity 0.2s cubic-bezier(0, 0, 0.2, 1), border-color 0.2s;
  }

  .element.shown {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition: visibility linear, opacity 0.2s cubic-bezier(0.4, 0, 1, 1), border-color 0.2s;
  }

  .element.shown:hover {
    z-index: 1;
    border-color: #ffffff;
  }

  .element::after {
    content: '';
    position: absolute;
    z-index: 3;
    inset: -1px;
    border-radius: inherit;
    background: #000000;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
  }

  &:has(.element.shown:hover) .element.shown:not(:hover)::after {
    opacity: 0.25;
  }

  .tile {
    overflow: hidden;
  }

  .tile > img,
  .tile::before {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .tile > img {
    object-fit: cover;
    background: #ffffff;
  }

  .tile::before {
    content: '';
    z-index: 1;
    height: 33%;
    opacity: 0.8;
    background: linear-gradient(#000000, transparent);
  }

  .tile-title {
    position: relative;
    z-index: 1;
    display: block;
    max-width: 85%;
    margin: 6px 8px;
    overflow: hidden;
    font-size: 12px;
    font-weight: 500;
    line-height: 14px;
    text-overflow: ellipsis;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.4);
    white-space: nowrap;
  }

  .duration {
    position: absolute;
    z-index: 1;
    right: 0;
    bottom: 0;
    margin: 0 4px 4px 0;
    padding: 4px 6px;
    border-radius: 2px;
    background: rgba(0, 0, 0, 0.8);
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.3em;
  }

  .count {
    position: absolute;
    z-index: 1;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    padding-left: 8px;
    background: rgba(0, 0, 0, 0.75);
    color: rgba(255, 255, 255, 0.8);
  }

  .round {
    border: 0;
    margin: 0;
  }

  .round.channel,
  .round.channel::after,
  .round.channel .face {
    border-radius: 50%;
  }

  .face {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: block;
    overflow: hidden;
    background: #ffffff;
  }

  .face img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .link-icon {
    position: absolute;
    z-index: 2;
    right: 2px;
    bottom: 2px;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 2px;
    background: #000000;
    color: #ffffff;
    transition: opacity 0.2s;
  }

  .round:hover .link-icon {
    opacity: 0;
  }

  .card {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    padding-left: 100%;
    opacity: 0;
    visibility: hidden;
    transition: visibility linear 0.2s, opacity 0.2s cubic-bezier(0, 0, 0.2, 1);
  }

  .opens-left .card {
    left: auto;
    right: 0;
    padding: 0 100% 0 0;
  }

  .round:hover .card {
    opacity: 1;
    visibility: visible;
    transition: visibility linear, opacity 0.2s cubic-bezier(0.4, 0, 1, 1);
  }

  .card::before {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: var(--radius);
    background: #ffffff;
    box-shadow: 0 0 4px #000000;
  }

  .card-body {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 115px;
    height: 100%;
    margin: 0 4px 0 12px;
    color: #767676;
  }

  .opens-left .card-body {
    margin: 0 12px 0 4px;
  }

  .card-title {
    color: #333333;
    font-weight: 500;
    text-decoration: none;
  }

  a.card-title,
  .card-action {
    color: #167ac6;
  }

  a.card-title:hover,
  .card-action:hover {
    text-decoration: underline;
  }

  .card-action {
    margin-top: 4px;
    overflow: hidden;
    font-weight: 500;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-metadata {
    margin-top: 4px;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }

  .channel .card-metadata {
    display: none;
  }

  .subscribe {
    align-self: flex-start;
    margin-top: 4px;
    padding: 0;
    border: 0;
    background: none;
    color: #0f0f0f;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  /* above the full screen title's shade, which youtube.com never draws over it */
  .hide {
    position: absolute;
    z-index: 1;
    top: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 8px;
    border: 0;
    border-radius: 12px;
    background: #ffffff;
    color: #000000;
    font: 500 12px/24px Roboto, Arial, sans-serif;
    cursor: pointer;
    pointer-events: auto;
  }

  @container end-screen (min-width: 448px) {
    .tile-title {
      max-width: none;
      max-height: 28px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      white-space: normal;
    }

    .card-body {
      width: 136px;
    }

    .card-title {
      font-size: 12px;
      line-height: 14px;
    }
  }

  @container end-screen (min-width: 605px) {
    .tile-title {
      max-height: 30px;
      font-size: 13px;
      line-height: 15px;
    }

    .card-title {
      font-size: 13px;
      line-height: 15px;
    }

    .card-body {
      margin: 0 8px 0 16px;
    }

    .opens-left .card-body {
      margin: 0 16px 0 8px;
    }
  }

  @container end-screen (min-width: 746.5px) {
    .element {
      font-size: 14px;
    }

    .tile-title {
      max-height: 36px;
      margin: 10px 12px;
      font-size: 15px;
      line-height: 18px;
    }

    .duration {
      margin: 0 6px 6px 0;
    }

    .count {
      gap: 12px;
      height: 32px;
    }

    .link-icon {
      right: 8px;
      bottom: 8px;
      width: 32px;
      height: 32px;
    }

    .card-body {
      width: 176px;
    }

    .card-title {
      font-size: 15px;
      line-height: 18px;
    }

    .channel .card-metadata {
      display: -webkit-box;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #ebebeb;
      font-size: 12px;
      line-height: 14px;
    }
  }

  @container end-screen (min-width: 1066.5px) {
    .element {
      font-size: 18px;
    }

    .tile-title {
      max-height: 48px;
      margin: 18px 20px;
      font-size: 21px;
      line-height: 24px;
    }

    .duration {
      margin: 0 12px 12px 0;
    }

    .count {
      gap: 14px;
      height: 40px;
    }

    .card-body {
      width: 264px;
      margin: 0 16px 0 32px;
    }

    .opens-left .card-body {
      margin: 0 32px 0 16px;
    }

    .card-title {
      font-size: 21px;
      line-height: 24px;
    }

    .card-action,
    .card-metadata {
      margin-top: 8px;
    }

    .channel .card-metadata {
      margin-top: 12px;
      padding-top: 12px;
      font-size: 18px;
      line-height: 21px;
    }
  }

  @container end-screen (min-width: 1600px) {
    .element {
      font-size: 28px;
    }

    .tile-title {
      max-height: 76px;
      font-size: 32px;
      line-height: 38px;
    }

    .duration {
      margin: 0 20px 20px 0;
    }

    .card-body {
      width: 392px;
      margin: 0 24px 0 48px;
    }

    .opens-left .card-body {
      margin: 0 48px 0 24px;
    }

    .card-title {
      font-size: 32px;
      line-height: 38px;
    }

    .channel .card-metadata {
      margin-top: 18px;
      padding-top: 18px;
      font-size: 28px;
      line-height: 34px;
    }
  }
`

const ChannelSubscribe = ({ channelId, subscribed }: { channelId: string, subscribed?: boolean }) => {
  const { signedIn } = useSession()
  const [state, setSubscribed] = useMutation(SET_SUBSCRIBED)
  const [on, setOn] = useState(subscribed === true)
  const onClick = () => {
    if (!signedIn) {
      signIn()
      return
    }
    void setSubscribed({ channelId, subscribed: !on }).then((result) => {
      if (result.error) {
        showToast(readable(result.error.message))
        return
      }
      setOn(result.data?.setSubscribed.isSubscribed === true)
      showToast(on ? 'Unsubscribed' : 'Subscribed')
    })
  }
  return (
    <button type='button' className='subscribe' aria-pressed={on} disabled={state.fetching} onClick={onClick}>
      {on ? 'Subscribed' : 'Subscribe'}
    </button>
  )
}

const ElementView = (
  { element, picture, shown, onOpen }: {
    element: EndScreenElement
    picture: Picture
    shown: boolean
    onOpen?: (target: UpNext) => void
  },
) => {
  const { left, top, width, height, radius, opensLeft } = placeElement(element, picture)
  const box = { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, '--radius': `${radius}px` }
  const image = element.image ? <img src={element.image} alt='' /> : undefined

  if (element.kind === 'video' || element.kind === 'playlist') {
    const target: UpNext = { id: element.videoId!, title: element.title, thumbnail: element.image, list: element.playlistId }
    return (
      <a
        className={`element tile${shown ? ' shown' : ''}`}
        style={{ ...box, borderRadius: `${radius}px` }}
        href={upNextHref(target)}
        aria-label={`${element.title}, ${element.kind}`}
        onClick={onOpen ? openOnClick(target, onOpen) : undefined}
      >
        {image}
        <span className='tile-title'>{element.title}</span>
        {element.kind === 'video' && element.badge ? <span className='duration'>{element.badge}</span> : undefined}
        {element.kind === 'playlist' ? <span className='count'><ListVideo size='1.3em' strokeWidth={1.5} />{element.badge}</span> : undefined}
      </a>
    )
  }

  const href = element.kind === 'channel' ? `/channel/${element.channelId!}` : element.url!
  return (
    <div className={`element round ${element.kind}${opensLeft ? ' opens-left' : ''}${shown ? ' shown' : ''}`} style={box}>
      <div className='card'>
        <div className='card-body'>
          {element.kind === 'channel'
            ? (
              <>
                <a className='card-title' href={href} target='_blank' rel='noopener' tabIndex={-1}>{element.title}</a>
                <ChannelSubscribe channelId={element.channelId!} subscribed={element.subscribed} />
              </>
            )
            : <span className='card-title'>{element.title}</span>}
          {element.metadata ? <span className='card-metadata'>{element.metadata}</span> : undefined}
          {element.kind === 'website' && element.action
            ? <a className='card-action' href={href} target='_blank' rel='noopener noreferrer' tabIndex={-1}>{element.action}</a>
            : undefined}
        </div>
      </div>
      <a
        className='face'
        href={href}
        target='_blank'
        rel={element.kind === 'channel' ? 'noopener' : 'noopener noreferrer'}
        aria-label={`${element.title}, ${element.kind}`}
      >
        {image}
      </a>
      {element.kind === 'website' ? <span className='link-icon'><LinkIcon size='60%' strokeWidth={2} /></span> : undefined}
    </div>
  )
}

/**
 * The elements a creator placed over the last seconds of the video, each from its start until its end or the video's,
 * with youtube.com's Hide toggle while any is due, except in the miniplayer (`docked`), where youtube.com shows none.
 * Opening a video or playlist goes through `onOpen`, as the end screen's own suggestions do; a channel or website opens
 * in a new tab, as on youtube.com.
 */
export const EndScreenElements = (
  { elements, video, time, ended, docked, onOpen }: {
    elements: readonly EndScreenElement[]
    video: HTMLVideoElement
    time: number
    ended: boolean
    docked: boolean
    onOpen?: (target: UpNext) => void
  },
) => {
  const picture = usePicture(video)
  const [hidden, setHidden] = useState(false)
  const ms = time * 1_000
  const due = elements.map(element => !ended && ms >= element.startMs && ms < element.endMs)
  const near = !ended && elements.some(element => ms >= element.startMs - PRELOAD_MS && ms < element.endMs)
  return (
    <div css={style} data-end-screen='elements'>
      {near
        ? (
          <div
            className='picture'
            style={{ left: `${picture.x}px`, top: `${picture.y}px`, width: `${picture.width}px`, height: `${picture.height}px` }}
          >
            {elements.map((element, index) => (
              <ElementView key={index} element={element} picture={picture} shown={due[index]! && !hidden} onOpen={onOpen} />
            ))}
          </div>
        )
        : undefined}
      {due.some(Boolean) && !docked
        ? (
          <button
            type='button'
            className='hide'
            aria-label={hidden ? 'Show endscreen cards' : 'Hide endscreen cards'}
            aria-pressed={hidden}
            onClick={() => setHidden(value => !value)}
          >
            {hidden ? <Eye size={12} strokeWidth={2} /> : <EyeOff size={12} strokeWidth={2} />}
            {hidden ? 'Show' : 'Hide'}
          </button>
        )
        : undefined}
    </div>
  )
}

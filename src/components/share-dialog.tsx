import type { ComponentChildren, TargetedFocusEvent } from 'preact'

import { css } from '@emotion/react'
import { useLayoutEffect, useState } from 'preact/hooks'

import { formatDuration } from './format'
import { watchLink } from '../player/links'
import { playheadOf } from '../player/seek'
import { Dialog } from './ui/dialog'
import { Rail } from './rail'
import { showToast } from './ui/toast'

/* youtube.com's targets, measured at 1280 and 412 px on 2026-11-10: 60 px marks in 70 px columns 8 px apart, the name
   12 px on 18 px 8 px below, and 40 px arrows centred on the marks 10 px inside the dialog's edges */
const style = css`
  display: flex;
  flex-direction: column;
  gap: 1.6rem;

  /* contained, or the dialog's column grows to the whole row and runs off a phone's screen */
  .targets {
    contain: inline-size;
    --rail-arrow-top: 1.6rem;
  }

  .targets .arrow.left {
    left: -1.4rem;
  }

  .targets .arrow.right {
    right: -1.4rem;
  }

  .target {
    width: 7rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.8rem;
    padding: 0.6rem 0 0.5rem;
    border: none;
    background: none;
    color: var(--text-primary);
    font: inherit;
    font-size: 1.2rem;
    line-height: 1.8rem;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }

  .target svg {
    flex: none;
    width: 6rem;
    height: 6rem;
  }

  .link-row {
    display: flex;
    gap: 0.8rem;
  }

  .link {
    flex: 1;
    min-width: 0;
    height: 4rem;
    padding: 0 1.2rem;
    border: 1px solid var(--border);
    border-radius: 0.8rem;
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 1.4rem;
  }

  .copy {
    flex: none;
    height: 4rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 0.8rem;
    background: var(--bg-inverse);
    color: var(--text-inverse);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
  }

  .copy:hover {
    background: var(--bg-inverse-hover);
  }

  .start-at {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    font-size: 1.4rem;
    color: var(--text-primary);
  }

  .embed {
    width: 100%;
    min-height: 8rem;
    padding: 0.8rem 1.2rem;
    border: 1px solid var(--border);
    border-radius: 0.8rem;
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: monospace;
    font-size: 1.2rem;
    resize: vertical;
  }
`

const copy = (value: string) => {
  const clipboard = navigator.clipboard
  if (!clipboard) {
    showToast('Could not copy the link')
    return
  }
  void clipboard.writeText(value).then(
    () => showToast('Link copied to clipboard'),
    () => showToast('Could not copy the link'),
  )
}

const query = (params: Record<string, string | undefined>) =>
  Object.entries(params).flatMap(([key, value]) => value === undefined ? [] : [`${key}=${encodeURIComponent(value)}`]).join('&')

const Mark = ({ children }: { children: ComponentChildren }) => (
  <svg viewBox='0 0 60 60' aria-hidden='true'>{children}</svg>
)

type Target = { name: string, mark: ComponentChildren, address: (link: string, title: string | undefined, videoId: string) => string }

/*
 * youtube.com's targets after Embed, in its order, with the address each opens in a new tab, measured signed out on
 * 2026-11-10: the same nine in JP, US, KR, RU, GB and DE. What names YouTube is left out: Facebook's dialog/share
 * carries youtube.com's own app id (sharer.php needs none), X's via=YouTube, LinkedIn's source=Youtube and Messages'
 * source=yt. youtube.com leaves its start out of these links even with Start at checked; this keeps it in.
 */
const TARGETS: readonly Target[] = [
  {
    name: 'Messages',
    mark: (
      <>
        <circle cx='30' cy='30' r='29.5' fill='#fff' stroke='#e5e5e5' />
        <path d='M22 18h16a8 8 0 0 1 8 8v4a8 8 0 0 1-8 8h-9l-7 5v-5a8 8 0 0 1-8-8v-4a8 8 0 0 1 8-8z' fill='#578cff' />
      </>
    ),
    address: link => `https://messages.google.com/web/share?${query({ text: link })}`,
  },
  {
    name: 'WhatsApp',
    mark: (
      <>
        <circle cx='30' cy='30' r='30' fill='#25d366' />
        <path d='M30 17a13 13 0 0 0-11.2 19.6L17 43l6.6-1.7A13 13 0 1 0 30 17z' fill='none' stroke='#fff' strokeWidth='2.6' strokeLinejoin='round' />
        <path d='M25 24.5c0 6 4.5 10.5 10.5 10.5' fill='none' stroke='#fff' strokeWidth='3.4' strokeLinecap='round' />
      </>
    ),
    address: link => `https://wa.me/?${query({ text: link })}`,
  },
  {
    name: 'Facebook',
    mark: (
      <>
        <circle cx='30' cy='30' r='30' fill='#3b5998' />
        <path d='M32.6 47V31.6h5l.8-5.6h-5.8v-3.4c0-1.6.5-2.7 2.8-2.7h3.1v-5a40 40 0 0 0-4.5-.2c-4.5 0-7.4 2.7-7.4 7.6V26h-5v5.6h5V47z' fill='#fff' />
      </>
    ),
    address: link => `https://www.facebook.com/sharer/sharer.php?${query({ u: link })}`,
  },
  {
    name: 'X',
    mark: (
      <>
        <circle cx='30' cy='30' r='30' fill='#000' />
        <path d='M20 18h6.5l14 24H34z' fill='#fff' />
        <path d='M39.5 18 21 42M40 18 22 42' stroke='#fff' strokeWidth='1.6' />
      </>
    ),
    address: (link, title) => `https://twitter.com/intent/tweet?${query({ url: link, text: title })}`,
  },
  {
    name: 'Email',
    mark: (
      <>
        <circle cx='30' cy='30' r='30' fill='#888' />
        <rect x='17' y='20' width='26' height='19' rx='2' fill='#fff' />
        <path d='m18 22 12 9 12-9' fill='none' stroke='#888' strokeWidth='2' strokeLinejoin='round' />
      </>
    ),
    address: link => `mailto:?${query({ body: link })}`,
  },
  {
    name: 'Reddit',
    mark: (
      <>
        <circle cx='30' cy='30' r='30' fill='#ff4500' />
        <circle cx='19.5' cy='29' r='3.5' fill='#fff' />
        <circle cx='40.5' cy='29' r='3.5' fill='#fff' />
        <ellipse cx='30' cy='34' rx='13' ry='9' fill='#fff' />
        <path d='M30 25l2-7.5 5.5 1.5' fill='none' stroke='#fff' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
        <circle cx='39' cy='19' r='2.5' fill='#fff' />
        <circle cx='25.5' cy='32.5' r='2' fill='#ff4500' />
        <circle cx='34.5' cy='32.5' r='2' fill='#ff4500' />
        <path d='M25.5 37.5c2.8 2 6.2 2 9 0' fill='none' stroke='#ff4500' strokeWidth='1.6' strokeLinecap='round' />
      </>
    ),
    address: (link, title) => `https://reddit.com/submit?${query({ url: link, title })}`,
  },
  {
    name: 'Pinterest',
    mark: (
      <>
        <circle cx='30' cy='30' r='30' fill='#bd081c' />
        <path d='M26 46l4.6-19.5M28.8 35c1 1.4 2.6 2.1 4.4 2.1 4.6 0 7.8-3.7 7.8-8.8 0-4.8-3.9-8.3-9.8-8.3-6.6 0-10.7 4.5-10.7 9.4 0 2.3.9 4.1 2.4 4.9' fill='none' stroke='#fff' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' />
      </>
    ),
    address: (link, title, videoId) => `https://pinterest.com/pin/create/button/?${query({
      url: link,
      description: title,
      is_video: 'true',
      media: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/maxresdefault.jpg`,
    })}`,
  },
  {
    name: 'LinkedIn',
    mark: (
      <>
        <circle cx='30' cy='30' r='30' fill='#0077b5' />
        <rect x='19.5' y='26.5' width='5' height='15' rx='0.5' fill='#fff' />
        <circle cx='22' cy='20.5' r='2.9' fill='#fff' />
        <path d='M28.5 26.5h4.7v2.1c1-1.6 2.9-2.5 5.2-2.5 4 0 5.6 2.6 5.6 6.8v8.6h-5v-7.8c0-2-.6-3.2-2.4-3.2-2 0-3.1 1.4-3.1 3.6v7.4h-5z' fill='#fff' />
      </>
    ),
    address: (link, title) => `https://www.linkedin.com/shareArticle?${query({ url: link, title })}`,
  },
]

const EMBED_MARK = (
  <>
    <circle cx='30' cy='30' r='30' fill='#f4f4f4' />
    <path d='M25 22l-8 8 8 8M35 22l8 8-8 8' fill='none' stroke='#606060' strokeWidth='2.4' strokeLinecap='round' strokeLinejoin='round' />
  </>
)

// m.youtube.com hands a touch browser's Share to the device's own share sheet, with the link alone; youtube.com's
// desktop site opens its dialog even where the browser has a sheet (both measured 2026-11-10)
const deviceSheet = () => typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches

/**
 * The share sheet for one video. `title` goes to the targets whose address carries one.
 *
 * The start-at offset is read ONCE, when the dialog opens, rather than tracked:
 * a checkbox that kept moving with playback would mean the link copied is not
 * the one the reader saw.
 */
export const ShareDialog = (
  { videoId, title, list, onClose }: { videoId: string, title?: string, list?: string, onClose: () => void },
) => {
  const [startAt] = useState(() => playheadOf(videoId))
  const [useStart, setUseStart] = useState(false)
  const [view, setView] = useState<'device' | 'share' | 'embed'>(() => deviceSheet() ? 'device' : 'share')

  const url = watchLink(location.origin, videoId, { list, t: useStart ? startAt : undefined })

  // a layout effect, so the sheet is asked for as soon as the dialog opens: a browser opens it only shortly after a press
  useLayoutEffect(() => {
    if (view !== 'device') return
    void navigator.share({ url }).then(onClose, (error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') onClose()
      else setView('share')
    })
  }, [])

  if (view === 'device') return null

  if (view === 'embed') {
    const embedSource = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}${useStart && startAt !== undefined ? `?start=${startAt}` : ''}`
    const embed = `<iframe width="560" height="315" src="${embedSource}" frameborder="0" allowfullscreen></iframe>`
    return (
      <Dialog key='embed' title='Embed Video' onClose={onClose}>
        <div css={style}>
          <textarea className='embed' readOnly value={embed} aria-label='Embed code' onFocus={(event: TargetedFocusEvent<HTMLTextAreaElement>) => event.currentTarget.select()} />
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog key='share' title='Share' onClose={onClose}>
      <div css={style}>
        <div className='targets'>
          <Rail label='share targets' count={TARGETS.length + 1}>
            <button type='button' className='target' onClick={() => setView('embed')}>
              <Mark>{EMBED_MARK}</Mark>
              Embed
            </button>
            {TARGETS.map(target => (
              <a key={target.name} className='target' href={target.address(url, title, videoId)} target='_blank' rel='noopener noreferrer'>
                <Mark>{target.mark}</Mark>
                {target.name}
              </a>
            ))}
          </Rail>
        </div>
        <div className='link-row'>
          <input className='link' readOnly value={url} aria-label='Share link' onFocus={(event: TargetedFocusEvent<HTMLInputElement>) => event.currentTarget.select()} />
          <button type='button' className='copy' onClick={() => copy(url)}>Copy</button>
        </div>
        {startAt !== undefined && startAt > 0
          ? (
            <label className='start-at'>
              <input type='checkbox' checked={useStart} onChange={() => setUseStart(value => !value)} />
              Start at {formatDuration(startAt) ?? '0:00'}
            </label>
          )
          : undefined}
      </div>
    </Dialog>
  )
}

export default ShareDialog

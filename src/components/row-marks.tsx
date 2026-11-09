import { css } from '@emotion/react'

import { formatViews } from './format'
import { NOTE } from './verified-badge'

const ARROW = 'M10 8.64 15.27 12 10 15.36V8.64M8 5v14l11-7L8 5Z'
const STAR = 'M6 .5a5.5 5.5 0 100 11 5.5 5.5 0 000-11Zm.27 2.045.906 1.837 2.027.295a.3.3 0 01.166.511l-1.467 1.43.346 2.019a.3.3 0 01-.435.316L6 8l-1.813.953a.3.3 0 01-.435-.316l.346-2.019-1.467-1.43a.3.3 0 01.166-.511l2.027-.295.907-1.837a.3.3 0 01.539 0Z'

const iconStyle = css`
  flex: none;
  fill: currentColor;
`

const arrowStyle = css`
  margin-right: 0.2rem;
  vertical-align: -0.15em;
`

/** The music note youtube.com draws before a song's length, inside the length badge. */
export const MusicNote = () => (
  <svg css={iconStyle} width={12} height={12} viewBox='0 0 24 24' aria-hidden='true' data-mark='music'>
    <path d={NOTE} />
  </svg>
)

/** The outlined play arrow youtube.com draws before a row's view count. */
export const ViewsArrow = () => (
  <svg css={[iconStyle, arrowStyle]} width={12} height={12} viewBox='0 0 24 24' aria-hidden='true' data-mark='views'>
    <path d={ARROW} />
  </svg>
)

// white on any theme, as it sits on the still
const cornerStyle = css`
  position: absolute;
  top: 0.4rem;
  left: 0.4rem;
  padding: 0.1rem 0.4rem;
  border-radius: 0.4rem;
  background: #ffffff;
  color: #0f0f0f;
  font-size: 1.2rem;
  font-weight: 500;
  line-height: 1.8rem;
`

/** The label youtube.com draws in a still's top corner, such as New. */
export const CornerBadge = ({ label }: { label: string }) => <span css={cornerStyle} data-mark='corner'>{label}</span>

// an inline block, so the space a lockup sends collapses inside it and only the margins show, as in youtube.com's flex row
const delimiterStyle = css`
  display: inline-block;
  margin: 0 0.4rem;
`

/**
 * A row's view count and date, led by the play arrow its answer names. A lockup sends the delimiter youtube.com draws
 * between them, with 4px each side; a row without one keeps a bullet.
 */
export const RowMeta = ({ video }: {
  video: { viewCount?: string | null, viewCountIcon?: boolean | null, publishedText?: string | null, metaDelimiter?: string | null }
}) => {
  const views = formatViews(video.viewCount)
  const date = video.publishedText || undefined
  if (views === undefined && date === undefined) return null
  const delimiter = video.metaDelimiter ?? undefined
  return (
    <div className='meta'>
      {video.viewCountIcon ? <ViewsArrow /> : undefined}
      {views}
      {views !== undefined && date !== undefined
        ? delimiter === undefined ? ' • ' : <span css={delimiterStyle}>{delimiter}</span>
        : undefined}
      {date}
    </div>
  )
}

const membersStyle = css`
  display: flex;
  align-items: center;
  gap: 0.2rem;
  color: var(--membership);
  font-size: 1.2rem;
  font-weight: 500;
  line-height: 1.8rem;
`

/** The green Members only mark youtube.com draws on its own line under a members-only row's date, and on its watch page. */
export const MembersOnly = () => (
  <div css={membersStyle} className='members-only'>
    <svg css={iconStyle} width={12} height={12} viewBox='0 0 12 12' aria-hidden='true'>
      <path d={STAR} />
    </svg>
    Members only
  </div>
)

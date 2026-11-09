import { css } from '@emotion/react'

import { NOTE } from './verified-badge'

const ARROW = 'M10 8.64 15.27 12 10 15.36V8.64M8 5v14l11-7L8 5Z'

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

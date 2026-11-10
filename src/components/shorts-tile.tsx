import type { VideoCardData } from './video-card'

import { css } from '@emotion/react'
import { Link } from 'wouter'

import { formatViews } from './format'
import { Thumbnail } from './thumbnail'
import { VideoCardMenu } from './video-card'

const shortsHrefFor = (id: string) => `/shorts/${encodeURIComponent(id)}`

/* youtube.com draws every Shorts tile alike, in a channel's Shorts tab, a channel's Home shelf and a search's shelf:
   a 2:3 still with 8px corners, a 16/22px title beside a 40px More actions button, and 14/20px views that step down
   to 12/18px below a 1024px window. Measured signed out on @MKBHD and a "rick astley" search, 2026-11-10. */
export const shortsTileStyle = css`
  min-width: 0;

  .thumb {
    display: block;
    aspect-ratio: 2 / 3;
    border-radius: 0.8rem;
    overflow: hidden;
    background: var(--bg-elevated);
  }

  .thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .details {
    position: relative;
    padding: 0.8rem 3.6rem 0 0;
  }

  .title {
    margin: 0 0 0.4rem;
    font-size: 1.6rem;
    font-weight: 500;
    line-height: 2.2rem;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .views {
    font-size: 1.4rem;
    line-height: 2rem;
    color: var(--text-secondary);
  }

  .more-menu {
    position: absolute;
    top: 0.8rem;
    right: 0;
  }

  .more {
    width: 4rem;
    height: 4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
  }

  .more:hover,
  .more-menu[data-open] .more {
    background: var(--bg-hover);
  }

  @media (max-width: 1023px) {
    .views {
      font-size: 1.2rem;
      line-height: 1.8rem;
    }
  }
`

/** One vertical tile that opens the Shorts player, as youtube.com draws a Short in a grid or a shelf. */
export const ShortsTile = ({ short }: { short: VideoCardData }) => {
  const href = shortsHrefFor(short.id)
  const views = formatViews(short.viewCount)
  return (
    <article css={shortsTileStyle} className='tile'>
      <Link href={href} className='thumb' tabIndex={-1} aria-hidden='true'>
        {short.thumbnail ? <Thumbnail src={short.thumbnail} srcSet={short.thumbnailSrcset} sizes='21rem' /> : undefined}
      </Link>
      <div className='details'>
        <h3 className='title'>
          <Link href={href}>{short.title}</Link>
        </h3>
        {views ? <div className='views'>{views}</div> : undefined}
        <VideoCardMenu videoId={short.id} title={short.title} iconSize={24} class='more-menu' />
      </div>
    </article>
  )
}

export default ShortsTile

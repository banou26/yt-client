import type { VideoCardData } from './video-card'

import { css } from '@emotion/react'
import { Link } from 'wouter'

import { formatViews } from './format'
import { shortsHrefFor } from './shorts-shelf'
import { Thumbnail } from './thumbnail'
import { VideoCardMenu } from './video-card'

/* youtube.com puts one tile per 214px step of the channel column: k steps hold
   k tiles, each (k * 214px - 32px) / k wide with 4px after it, the row centred,
   so 1070px holds five 207.6px tiles and 1284px six 208.7px ones. The row is
   therefore k * 218px - 32px wide. Measured on youtube.com/@MKBHD/shorts signed
   out at 360 to 2560px wide, 2026-11-10. */
const style = css`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18.6rem, 1fr));
  row-gap: 0.6rem;
  width: calc(round(down, 100%, 21.4rem) * 218 / 214 - 3.2rem);
  margin: 0 auto;

  .tile {
    min-width: 0;
    margin-right: 0.4rem;
  }

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

  /* youtube.com's views line steps down below a 1024px window, whatever the tile width */
  @media (max-width: 1023px) {
    .views {
      font-size: 1.2rem;
      line-height: 1.8rem;
    }
  }
`

const SKELETONS = 12

/** A channel's Shorts tab: vertical tiles that open the Shorts player, laid out like youtube.com's. */
export const ShortsGrid = ({ shorts, fetching = false }: { shorts: readonly VideoCardData[], fetching?: boolean }) => (
  <div css={style}>
    {shorts.map(short => {
      const href = shortsHrefFor(short.id)
      const views = formatViews(short.viewCount)
      return (
        <article className='tile' key={short.id}>
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
    })}
    {fetching && shorts.length === 0
      ? Array.from({ length: SKELETONS }, (_, index) => (
        <div className='tile' key={`skeleton-${index}`} aria-hidden='true'>
          <div className='thumb' />
        </div>
      ))
      : undefined}
  </div>
)

export default ShortsGrid

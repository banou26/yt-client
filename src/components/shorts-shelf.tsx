import type { VideoCardData } from './video-card'

import { css } from '@emotion/react'
import { Link } from 'wouter'

import { formatViews } from './format'
import { Rail } from './rail'
import { Thumbnail } from './thumbnail'

export const shortsHrefFor = (id: string) => `/shorts/${encodeURIComponent(id)}`

const style = css`
  /* A full-width band in the grid's second row. An item placed on both axes is
     placed before every auto-placed card, so the cards fill the first row at
     whatever column count the width gives and continue below the shelf. */
  grid-row: 2;
  grid-column: 1 / -1;
  margin: 1.6rem 0 2.4rem;

  .shelf-head {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-bottom: 1.6rem;
  }

  .shelf-title {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .card {
    width: 21rem;
  }

  .thumb {
    display: block;
    aspect-ratio: 9 / 16;
    border-radius: 1.2rem;
    overflow: hidden;
    background: var(--bg-elevated);
  }

  .thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .title {
    margin: 0.8rem 0 0;
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 2rem;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .views {
    margin-top: 0.4rem;
    font-size: 1.2rem;
    color: var(--text-secondary);
  }
`

export const ShortsShelf = ({ shorts, title = 'Shorts' }: { shorts: readonly VideoCardData[], title?: string }) => {
  if (shorts.length === 0) return null

  return (
    <section css={style} aria-label={title}>
      <div className='shelf-head'>
        <svg width='24' height='24' viewBox='0 0 24 24' aria-hidden='true'>
          <path
            fill='#f00'
            d='M17.77 10.32l-1.2-.5 1.2-.5a3.7 3.7 0 0 0-3.24-6.64L5.1 7.2a3.7 3.7 0 0 0 .13 6.68l1.2.5-1.2.5a3.7 3.7 0 0 0 3.24 6.64l9.43-4.52a3.7 3.7 0 0 0-.13-6.68z'
          />
          <path fill='#fff' d='M10 14.65v-5.3L15 12z' />
        </svg>
        <h2 className='shelf-title'>{title}</h2>
      </div>
      <Rail label='shorts' count={shorts.length}>
        {shorts.map(short => (
          <article className='card' key={short.id}>
            <Link href={shortsHrefFor(short.id)} className='thumb' tabIndex={-1} aria-hidden='true'>
              {short.thumbnail ? <Thumbnail src={short.thumbnail} srcSet={short.thumbnailSrcset} sizes='21rem' /> : undefined}
            </Link>
            <h3 className='title'>
              <Link href={shortsHrefFor(short.id)}>{short.title}</Link>
            </h3>
            {short.viewCount ? <div className='views'>{formatViews(short.viewCount)}</div> : undefined}
          </article>
        ))}
      </Rail>
    </section>
  )
}

export default ShortsShelf

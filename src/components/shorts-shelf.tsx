import type { VideoCardData } from './video-card'

import { css } from '@emotion/react'

import { Rail } from './rail'
import { ShortsTile } from './shorts-tile'

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

  .tile {
    width: 21rem;
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
        {shorts.map(short => <ShortsTile key={short.id} short={short} />)}
      </Rail>
    </section>
  )
}

export default ShortsShelf

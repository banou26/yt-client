import type { VideoCardData } from './video-card'

import { css } from '@emotion/react'

import { ShortsTile, shortsTileStyle } from './shorts-tile'

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
    margin-right: 0.4rem;
  }
`

const SKELETONS = 12

/** A channel's Shorts tab: vertical tiles that open the Shorts player, laid out like youtube.com's. */
export const ShortsGrid = ({ shorts, fetching = false }: { shorts: readonly VideoCardData[], fetching?: boolean }) => (
  <div css={style}>
    {shorts.map(short => <ShortsTile key={short.id} short={short} />)}
    {fetching && shorts.length === 0
      ? Array.from({ length: SKELETONS }, (_, index) => (
        <div css={shortsTileStyle} className='tile' key={`skeleton-${index}`} aria-hidden='true'>
          <div className='thumb' />
        </div>
      ))
      : undefined}
  </div>
)

export default ShortsGrid

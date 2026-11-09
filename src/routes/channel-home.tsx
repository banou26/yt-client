import type { ChannelViewQuery } from '../generated/graphql'

import { css } from '@emotion/react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { Link } from 'wouter'

import { formatMeta } from '../components/format'
import { PlaylistCard } from '../components/playlist-card'
import { PostCard } from '../components/post-card'
import { Rail } from '../components/rail'
import { ShortsShelf } from '../components/shorts-shelf'
import { VideoCard, watchHrefFor } from '../components/video-card'
import { isRichRow } from './channel-rows'

type Home = NonNullable<ChannelViewQuery['channel']['home']>
type Shelf = Home['shelves'][number]

const style = css`
  > * {
    padding: 2.4rem 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  > :first-of-type {
    padding-top: 0;
  }

  > :last-child {
    border-bottom: none;
  }

  .featured {
    display: flex;
    gap: 2.4rem;
  }

  .featured-thumb {
    flex: none;
    display: block;
    width: 42.4rem;
    max-width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 1.2rem;
    overflow: hidden;
    background: var(--bg-elevated);
  }

  .featured-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .featured-text {
    min-width: 0;
    max-width: 40rem;
  }

  .featured-title {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 2rem;
    color: var(--text-primary);
  }

  .featured-meta {
    margin-top: 0.8rem;
    font-size: 1.2rem;
    color: var(--text-secondary);
  }

  .featured-description {
    margin: 1.6rem 0 0;
    font-size: 1.4rem;
    line-height: 2rem;
    color: var(--text-primary);
    white-space: pre-wrap;
    display: -webkit-box;
    -webkit-line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .shelf-title {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    line-height: 2.8rem;
    color: var(--text-primary);
  }

  .shelf-subtitle {
    margin: 0.4rem 0 0;
    max-width: 64rem;
    font-size: 1.4rem;
    line-height: 2rem;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* youtube.com's row cards are 214px with their gap, the same step the
     channel column widens by, so a row always ends on a whole card. The arrow
     sits on the middle of the thumbnail. */
  .shelf-rail {
    --rail-arrow-top: 3.8rem;
    margin-top: 1.6rem;
  }

  .shelf-card {
    width: 20.6rem;
  }

  .channel-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 20.6rem;
    text-align: center;
    color: var(--text-primary);
  }

  .channel-tile img,
  .channel-tile .initial {
    width: 13.6rem;
    height: 13.6rem;
    border-radius: 50%;
    object-fit: cover;
    background: var(--bg-chip);
  }

  .channel-tile .initial {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 4.8rem;
  }

  .channel-tile .name {
    margin-top: 1.2rem;
    font-size: 1.4rem;
    font-weight: 500;
  }

  .channel-tile .subscribers {
    margin-top: 0.4rem;
    font-size: 1.2rem;
    color: var(--text-secondary);
  }

  /* youtube.com's box art is 210 by 290px on a 214px step */
  .game-tile {
    display: flex;
    flex-direction: column;
    width: 20.6rem;
    color: var(--text-primary);
  }

  .game-tile .box-art {
    width: 100%;
    aspect-ratio: 210 / 290;
    border-radius: 0.8rem;
    object-fit: cover;
    background: var(--bg-elevated);
  }

  .game-tile .name {
    margin-top: 0.8rem;
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 2rem;
  }

  /* A topic channel's rows on youtube.com: home-feed cards, three across at
     the 1070px column (four for playlists), one row until Show more. Measured
     on youtube.com's Live, News, Sports and Music, 2026-11-10. */
  .rich-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(31rem, 100%), 1fr));
    column-gap: 1.6rem;
    row-gap: 2.4rem;
    margin-top: 1.6rem;
  }

  .rich-grid.playlists {
    grid-template-columns: repeat(auto-fill, minmax(min(23rem, 100%), 1fr));
  }

  .rich-grid .post-text {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .show-more {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    height: 3.6rem;
    margin: 2.4rem auto 0;
    padding: 0 1.6rem;
    border: 1px solid var(--border-subtle);
    border-radius: 1.8rem;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
  }

  .show-more:hover {
    background: var(--bg-hover);
  }

  @media (max-width: 768px) {
    .featured {
      flex-direction: column;
    }
  }
`

const ShelfHeading = ({ shelf }: { shelf: Shelf }) => (
  <>
    <h2 className='shelf-title'>{shelf.url ? <Link href={shelf.url}>{shelf.title}</Link> : shelf.title}</h2>
    {shelf.subtitle ? <p className='shelf-subtitle'>{shelf.subtitle}</p> : undefined}
  </>
)

const RichShelfRow = ({ shelf }: { shelf: Shelf }) => {
  const gridRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState<number>()
  const [expanded, setExpanded] = useState(false)
  // the grid's own track count, so the first row is whole at any width
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const measure = () => setColumns(getComputedStyle(grid).gridTemplateColumns.split(' ').length)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [])
  const cards = [
    ...shelf.videos.map(video => <VideoCard key={video.id} video={video} />),
    ...shelf.playlists.map(playlist => (
      <PlaylistCard
        key={playlist.id}
        id={playlist.id}
        title={playlist.title}
        thumbnail={playlist.thumbnail}
        videoCountText={playlist.videoCountText}
      />
    )),
    ...shelf.posts.map(post => <PostCard key={post.id} post={post} />),
  ]
  const more = columns !== undefined && cards.length > columns
  return (
    <section aria-label={shelf.title}>
      <ShelfHeading shelf={shelf} />
      <div ref={gridRef} className={shelf.videos.length + shelf.posts.length > 0 ? 'rich-grid' : 'rich-grid playlists'}>
        {more && !expanded ? cards.slice(0, columns) : cards}
      </div>
      {more
        ? (
          <button type='button' className='show-more' aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show less' : 'Show more'}
            {expanded ? <ChevronUp size={20} strokeWidth={1.5} /> : <ChevronDown size={20} strokeWidth={1.5} />}
          </button>
        )
        : undefined}
    </section>
  )
}

const ShelfRow = ({ shelf }: { shelf: Shelf }) => {
  if (shelf.shorts.length > 0 && shelf.videos.length + shelf.playlists.length + shelf.channels.length + shelf.games.length + shelf.posts.length === 0) {
    return <ShortsShelf shorts={shelf.shorts} />
  }
  if (isRichRow(shelf)) return <RichShelfRow shelf={shelf} />
  const count = shelf.videos.length + shelf.playlists.length + shelf.channels.length + shelf.games.length
  return (
    <section aria-label={shelf.title}>
      <ShelfHeading shelf={shelf} />
      <div className='shelf-rail'>
        <Rail label={shelf.title} count={count}>
          {shelf.videos.map(video => (
            <div className='shelf-card' key={video.id}>
              <VideoCard video={video} variant='shelf' />
            </div>
          ))}
          {shelf.playlists.map(playlist => (
            <div className='shelf-card' key={playlist.id}>
              <PlaylistCard
                id={playlist.id}
                title={playlist.title}
                thumbnail={playlist.thumbnail}
                videoCountText={playlist.videoCountText}
              />
            </div>
          ))}
          {shelf.channels.map(channel => (
            <Link className='channel-tile' href={`/channel/${channel.id}`} key={channel.id}>
              {channel.avatar
                ? <img src={channel.avatar} alt='' loading='lazy' />
                : <span className='initial' aria-hidden='true'>{channel.name.slice(0, 1).toUpperCase()}</span>}
              <span className='name'>{channel.name}</span>
              {channel.subscriberCountText ? <span className='subscribers'>{channel.subscriberCountText}</span> : undefined}
            </Link>
          ))}
          {shelf.games.map(game => (
            <Link className='game-tile' href={`/channel/${game.id}`} key={game.id}>
              {game.boxArt
                ? <img className='box-art' src={game.boxArt} alt='' loading='lazy' />
                : <span className='box-art' aria-hidden='true' />}
              <span className='name'>{game.title}</span>
            </Link>
          ))}
        </Rail>
      </div>
    </section>
  )
}

export const ChannelHome = ({ home }: { home: Home }) => {
  const featured = home.featured
  const meta = featured ? formatMeta(featured.viewCount, featured.publishedText) : undefined
  return (
    <div css={style}>
      {featured
        ? (
          <section className='featured' aria-label='Featured video'>
            <Link href={watchHrefFor(featured.id)} className='featured-thumb' tabIndex={-1} aria-hidden='true'>
              {featured.thumbnail ? <img src={featured.thumbnail} alt='' /> : undefined}
            </Link>
            <div className='featured-text'>
              <h2 className='featured-title'><Link href={watchHrefFor(featured.id)}>{featured.title}</Link></h2>
              {meta ? <div className='featured-meta'>{meta}</div> : undefined}
              {featured.description ? <p className='featured-description'>{featured.description}</p> : undefined}
            </div>
          </section>
        )
        : undefined}
      {home.shelves.map((shelf, index) => <ShelfRow key={`${index}:${shelf.title}`} shelf={shelf} />)}
    </div>
  )
}

export default ChannelHome

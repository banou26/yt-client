import type { ChannelViewQuery } from '../generated/graphql'

import { css } from '@emotion/react'
import { Link } from 'wouter'

import { formatMeta } from '../components/format'
import { PlaylistCard } from '../components/playlist-card'
import { Rail } from '../components/rail'
import { ShortsShelf } from '../components/shorts-shelf'
import { VideoCard, watchHrefFor } from '../components/video-card'

type Home = NonNullable<ChannelViewQuery['channel']['home']>
type Shelf = Home['shelves'][number]

const style = css`
  > * {
    padding: 2.4rem 0;
    border-bottom: 1px solid var(--border-subtle);
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

  @media (max-width: 768px) {
    .featured {
      flex-direction: column;
    }
  }
`

const ShelfRow = ({ shelf }: { shelf: Shelf }) => {
  if (shelf.shorts.length > 0 && shelf.videos.length + shelf.playlists.length + shelf.channels.length === 0) {
    return <ShortsShelf shorts={shelf.shorts} />
  }
  const count = shelf.videos.length + shelf.playlists.length + shelf.channels.length
  return (
    <section aria-label={shelf.title}>
      <h2 className='shelf-title'>{shelf.url ? <Link href={shelf.url}>{shelf.title}</Link> : shelf.title}</h2>
      {shelf.subtitle ? <p className='shelf-subtitle'>{shelf.subtitle}</p> : undefined}
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

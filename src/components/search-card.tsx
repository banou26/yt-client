import type { SearchResultsQuery } from '../generated/graphql'

import { css } from '@emotion/react'
import { Radio } from 'lucide-react'
import { Link } from 'wouter'

import { Rail } from './rail'
import SubscribeButton from './subscribe-button'
import { VerifiedBadge } from './verified-badge'
import { VideoCard, watchHrefFor } from './video-card'

export type SearchCardData = Extract<SearchResultsQuery['search']['results'][number], { __typename: 'SearchCard' }>

const style = css`
  /* youtube.com draws the card dark in both themes, so the tokens its contents
     read are pinned to the dark palette here. */
  --text-primary: #f1f1f1;
  --text-secondary: #aaaaaa;
  --bg-inverse: #f1f1f1;
  --bg-inverse-hover: #ffffff;
  --text-inverse: #0f0f0f;
  --bg-chip: rgba(255, 255, 255, 0.1);
  --bg-chip-hover: rgba(255, 255, 255, 0.2);
  --bg-hover: rgba(255, 255, 255, 0.1);
  --bg-elevated: #212121;
  --bg-menu: #282828;
  --border-subtle: rgba(255, 255, 255, 0.2);
  color-scheme: dark;

  position: relative;
  isolation: isolate;
  padding: 2.4rem;
  border-radius: 2.4rem;
  background: linear-gradient(to bottom, #3a3a3a, #0f0f0f 75%);
  color: var(--text-primary);

  .card-backdrop {
    position: absolute;
    inset: 0 0 0 40%;
    z-index: -1;
    border-radius: 0 2.4rem 2.4rem 0;
    background-position: center 25%;
    background-size: cover;
    opacity: 0.45;
    filter: blur(1rem);
    mask-image: radial-gradient(ellipse at top right, #000 20%, transparent 70%);
  }

  .card-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.6rem 4.8rem;
  }

  .card-identity {
    display: flex;
    align-items: center;
    gap: 1.6rem;
    min-width: 0;
  }

  .card-avatar {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 10.4rem;
    height: 10.4rem;
    border: 0.3rem solid rgba(255, 255, 255, 0.85);
    border-radius: 50%;
    overflow: hidden;
    background: var(--bg-chip);
    font-size: 4rem;
  }

  .card-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-name {
    display: flex;
    align-items: center;
    margin: 0;
    font-size: 3.6rem;
    font-weight: 700;
    line-height: 4.4rem;
  }

  .card-meta {
    margin-top: 0.4rem;
    font-size: 1.4rem;
    color: var(--text-secondary);
  }

  .card-about {
    flex: 1 1 36rem;
    min-width: 0;
  }

  .card-description {
    margin: 0 0 1.2rem;
    font-size: 1.4rem;
    line-height: 2rem;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
  }

  .card-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    height: 3.6rem;
    padding: 0 1.6rem;
    border: 1px solid var(--border-subtle);
    border-radius: 1.8rem;
    font-size: 1.4rem;
    font-weight: 500;
    transition: background 0.15s ease;
  }

  .card-pill:hover {
    background: var(--bg-hover);
  }

  .card-rail {
    margin-top: 2.4rem;
  }

  /* Three tiles to a row, as on youtube.com, with the rest behind the arrow. */
  .card-tile {
    width: max(24rem, calc((100% - 1.6rem) / 3));
  }

  .card-mix-thumb {
    position: relative;
    display: block;
    aspect-ratio: 16 / 9;
    border-radius: 1.2rem;
    overflow: hidden;
    background: var(--bg-elevated);
  }

  .card-mix-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-mix-badge {
    position: absolute;
    right: 0.6rem;
    bottom: 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.1rem 0.4rem;
    border-radius: 0.4rem;
    background: var(--bg-badge);
    color: var(--text-on-media);
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.8rem;
  }

  .card-mix-title {
    display: block;
    margin-top: 1.2rem;
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 2rem;
  }
`

/**
 * The card youtube.com puts above the results of an artist or channel search:
 * the channel with its actions, then a row of its mix and top videos.
 */
export const SearchCard = ({ card }: { card: SearchCardData }) => {
  const { cardChannel: channel, mix, videos } = card
  const channelHref = `/channel/${channel.id}`
  const mixHref = mix ? watchHrefFor(mix.videoId, { list: mix.id }) : undefined
  const meta = [channel.handle, channel.subscriberCountText, channel.videoCountText].filter(Boolean).join(' • ')
  return (
    <section css={style} aria-label={channel.name}>
      {channel.avatar
        ? <div className='card-backdrop' style={{ backgroundImage: `url(${JSON.stringify(channel.avatar)})` }} aria-hidden='true' />
        : undefined}
      <div className='card-head'>
        <div className='card-identity'>
          <Link href={channelHref} className='card-avatar' tabIndex={-1} aria-hidden='true'>
            {channel.avatar ? <img src={channel.avatar} alt='' /> : channel.name.slice(0, 1).toUpperCase()}
          </Link>
          <div>
            <h2 className='card-name'>
              <Link href={channelHref}>{channel.name}</Link>
              <VerifiedBadge channel={channel} size={24} />
            </h2>
            {meta ? <div className='card-meta'>{meta}</div> : undefined}
          </div>
        </div>
        <div className='card-about'>
          {channel.description ? <p className='card-description'>{channel.description}</p> : undefined}
          <div className='card-actions'>
            <SubscribeButton channelId={channel.id} subscribed={channel.isSubscribed} notificationLevel={channel.notificationLevel} />
            <Link href={channelHref} className='card-pill'>View Channel</Link>
            {mixHref
              ? (
                <Link href={mixHref} className='card-pill'>
                  <Radio size={20} strokeWidth={1.5} />
                  Mix
                </Link>
              )
              : undefined}
          </div>
        </div>
      </div>
      <div className='card-rail'>
        <Rail label={`${channel.name} videos`} count={videos.length + (mix ? 1 : 0)}>
          {mix && mixHref
            ? (
              <Link href={mixHref} className='card-tile'>
                <span className='card-mix-thumb'>
                  {mix.thumbnail ? <img src={mix.thumbnail} alt='' loading='lazy' /> : undefined}
                  <span className='card-mix-badge'>
                    <Radio size={14} strokeWidth={2} />
                    Mix
                  </span>
                </span>
                <span className='card-mix-title'>{mix.title}</span>
              </Link>
            )
            : undefined}
          {videos.map(video => (
            <div className='card-tile' key={video.id}>
              <VideoCard video={video} variant='shelf' />
            </div>
          ))}
        </Rail>
      </div>
    </section>
  )
}

export default SearchCard

import type { SearchResultsQuery } from '../generated/graphql'

import { css } from '@emotion/react'
import { Link } from 'wouter'

import { formatDuration } from './format'
import { Thumbnail } from './thumbnail'
import { watchHrefFor } from './video-card'

export type TopicCardData = NonNullable<SearchResultsQuery['search']['topic']>

type TopicVideo = TopicCardData['videos'][number]

// youtube.com's card in the right column of a search for "minecraft", measured signed out at 1280px on 2026-11-10
const style = css`
  .topic-head {
    display: block;
    padding: 1.6rem;
    border-radius: 1.2rem 1.2rem 0 0;
    background: var(--bg-hover);
  }

  .topic-title {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 400;
    line-height: 2.6rem;
    color: var(--text-primary);
  }

  .topic-subtitle {
    display: block;
    margin-top: 0.8rem;
    font-size: 1.6rem;
    line-height: 2.2rem;
    color: var(--text-secondary);
  }

  .topic-hero {
    position: relative;
    display: block;
    aspect-ratio: 16 / 9;
    border-radius: 0 0 1.2rem 1.2rem;
    overflow: hidden;
    background: var(--bg-chip);
  }

  .topic-hero img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .topic-hero-text {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 10rem 1.6rem 2rem;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.9));
    color: var(--text-on-media);
  }

  .topic-hero-title {
    overflow: hidden;
    font-size: 1.8rem;
    line-height: 2.6rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .topic-hero-subtitle {
    font-size: 1.2rem;
    line-height: 1.8rem;
  }

  .topic-list {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    margin-top: 1.6rem;
  }

  .topic-row {
    display: grid;
    grid-template-columns: 12rem minmax(0, 1fr);
    gap: 1.6rem;
  }

  .topic-row-thumb {
    position: relative;
    display: block;
    aspect-ratio: 120 / 68;
    border-radius: 0.8rem;
    overflow: hidden;
    background: var(--bg-chip);
  }

  .topic-row-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .topic-row-thumb .badge {
    position: absolute;
    right: 0.4rem;
    bottom: 0.4rem;
    padding: 0 0.4rem;
    border-radius: 0.4rem;
    background: var(--bg-badge);
    color: var(--text-on-media);
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.8rem;
  }

  .topic-row-title {
    margin: 0 0 0.4rem;
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 2rem;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .topic-row-line {
    display: block;
    width: fit-content;
    font-size: 1.2rem;
    line-height: 1.8rem;
    color: var(--text-secondary);
  }

  .topic-all {
    display: block;
    margin-top: 1.6rem;
    padding: 1.6rem 0;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-primary);
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 2rem;
    text-transform: uppercase;
  }
`

const scheduled = new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' })

const TopicRow = ({ video }: { video: TopicVideo }) => {
  const href = watchHrefFor(video.id)
  const duration = formatDuration(video.durationSeconds)
  const line = video.scheduledAt ? `Scheduled for ${scheduled.format(new Date(video.scheduledAt))}` : video.subtitle
  return (
    <article className='topic-row'>
      <Link href={href} className='topic-row-thumb' tabIndex={-1} aria-hidden='true'>
        {video.thumbnail ? <Thumbnail src={video.thumbnail} /> : undefined}
        {duration ? <span className='badge'>{duration}</span> : undefined}
      </Link>
      <div>
        <h3 className='topic-row-title'>
          <Link href={href}>{video.title}</Link>
        </h3>
        {video.channel ? <Link href={`/channel/${video.channel.id}`} className='topic-row-line'>{video.channel.name}</Link> : undefined}
        {line ? <span className='topic-row-line'>{line}</span> : undefined}
      </div>
    </article>
  )
}

/**
 * The card youtube.com puts in the right column of a broad search: the topic,
 * which opens its channel, its newest video large, and a few more.
 */
export const TopicCard = ({ topic }: { topic: TopicCardData }) => {
  const channelHref = `/channel/${topic.channelId}`
  const { hero } = topic
  return (
    <aside css={style} aria-label={topic.title}>
      <Link href={channelHref} className='topic-head'>
        <h2 className='topic-title'>{topic.title}</h2>
        {topic.subtitle ? <span className='topic-subtitle'>{topic.subtitle}</span> : undefined}
      </Link>
      {hero
        ? (
          <Link href={watchHrefFor(hero.id)} className='topic-hero'>
            {hero.thumbnail ? <Thumbnail src={hero.thumbnail} /> : undefined}
            <span className='topic-hero-text'>
              <span className='topic-hero-title'>{hero.title}</span>
              {hero.subtitle ? <span className='topic-hero-subtitle'>{hero.subtitle}</span> : undefined}
            </span>
          </Link>
        )
        : undefined}
      {topic.videos.length > 0
        ? <div className='topic-list'>{topic.videos.map(video => <TopicRow key={video.id} video={video} />)}</div>
        : undefined}
      <Link href={channelHref} className='topic-all'>View all</Link>
    </aside>
  )
}

export default TopicCard

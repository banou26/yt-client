import type { SubscriptionsFeedQuery } from '../generated/graphql'

import { css } from '@emotion/react'
import { CircleUserRound } from 'lucide-react'
import { useState } from 'preact/hooks'
import { useQuery } from 'urql'
import { Link } from 'wouter'

import { useDocumentTitle } from '../app'
import { DataFailure } from '../components/data-failure'
import { FeedSentinel, useInfiniteFeed } from '../components/use-infinite-feed'
import { VideoGrid } from '../components/video-grid'
import { gql } from '../generated'
import { EMPTY_PAGES_LIMIT, emptyPagesInARow, matchesFilter } from '../groups/filter'
import { useGroups } from '../groups/store'
import { useSession } from '../session'
import { signIn } from '../sign-in'

const SUBSCRIPTIONS_FEED_QUERY = gql(`
  query SubscriptionsFeed($cursor: String) {
    subscriptions(cursor: $cursor) {
      items {
        id
        title
        inlinePlayerParams
        thumbnail
        thumbnailSrcset
        animatedThumbnail
        durationSeconds
        viewCount
        publishedText
        isLive
        isShort
        progressPercent
        channel { id name avatar isVerified isVerifiedArtist }
        byline { text isVerified isVerifiedArtist }
        collaborators { id name avatar handle subscriberCountText isVerified isVerifiedArtist }
      }
      cursor
    }
  }
`)

type SubscriptionsPage = SubscriptionsFeedQuery['subscriptions']

const style = css`
  padding: 2.4rem 1.6rem;

  .heading {
    margin: 0 0 2.4rem;
    font-size: 2rem;
    font-weight: 700;
    line-height: 2.8rem;
    color: var(--text-primary);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.2rem 2.4rem;
    margin-bottom: 2.4rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.2rem;
  }

  .chip {
    height: 3.2rem;
    padding: 0 1.2rem;
    border: none;
    border-radius: 0.8rem;
    background: var(--bg-chip);
    color: var(--text-primary);
    font-size: 1.4rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .chip:hover {
    background: var(--bg-chip-hover);
  }

  .chip[aria-pressed='true'] {
    background: var(--bg-inverse);
    color: var(--text-inverse);
  }

  .chip .emoji {
    margin-right: 0.6rem;
  }

  .manage {
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--accent);
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    font-size: 1.4rem;
    color: var(--text-primary);
    cursor: pointer;
  }

  .toggle input {
    width: 1.8rem;
    height: 1.8rem;
    margin: 0;
    accent-color: var(--accent);
  }

  .more {
    display: block;
    height: 3.6rem;
    margin: 2.4rem auto 0;
    padding: 0 1.6rem;
    border: 1px solid var(--border-strong);
    border-radius: 1.8rem;
    background: transparent;
    color: var(--accent);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
  }

  .more:hover {
    background: var(--accent-hover);
    border-color: transparent;
  }

  .notice {
    padding: 2.4rem 0;
    font-size: 1.4rem;
    color: var(--text-secondary);
    text-align: center;
  }

  .card {
    max-width: 56rem;
    margin: 4.8rem auto 0;
    padding: 2.4rem;
    border-radius: 1.2rem;
    background: var(--bg-subtle);
    text-align: center;
  }

  .card h2 {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .sign-in {
    display: inline-flex;
    align-items: center;
    gap: 0.8rem;
    height: 3.6rem;
    margin-top: 1.6rem;
    padding: 0 1.5rem;
    border: 1px solid var(--border-strong);
    border-radius: 1.8rem;
    background: transparent;
    color: var(--accent);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .sign-in:hover {
    background: var(--accent-hover);
    border-color: transparent;
  }
`

const SubscriptionsFeedPage = () => {
  useDocumentTitle('Subscriptions')
  const { ready, signedIn } = useSession()
  const groups = useGroups()
  const [groupId, setGroupId] = useState<string | undefined>(undefined)
  const [hideLive, setHideLive] = useState(false)
  const [hideWatched, setHideWatched] = useState(false)
  const [loaded, setLoaded] = useState<SubscriptionsPage[]>([])
  const [{ data, error, fetching }, reexecute] = useQuery({
    query: SUBSCRIPTIONS_FEED_QUERY,
    variables: { cursor: loaded[loaded.length - 1]?.cursor },
    pause: !ready || !signedIn
  })
  const page = data?.subscriptions
  // urql keeps the previous result while the next page is in flight, so the live page can repeat one already consumed
  const pages = page && loaded[loaded.length - 1] !== page ? [...loaded, page] : loaded
  const { items, cursor } = useInfiniteFeed({ pages, key: video => video.id })
  const group = groups.find(candidate => candidate.id === groupId)
  const filter = { channelIds: group ? new Set(group.channels.map(channel => channel.id)) : undefined, hideLive, hideWatched }
  const shown = items.filter(item => matchesFilter(item, filter))
  const stalled = emptyPagesInARow(pages, filter) >= EMPTY_PAGES_LIMIT

  const onMore = () => {
    if (!page?.cursor || fetching || error) return
    setLoaded(previous => previous[previous.length - 1] === page ? previous : [...previous, page])
  }

  if (!ready) {
    return (
      <main css={style}>
        <h1 className='heading'>Subscriptions</h1>
        <VideoGrid videos={[]} fetching />
      </main>
    )
  }

  if (!signedIn) {
    return (
      <main css={style}>
        <h1 className='heading'>Subscriptions</h1>
        <div className='card'>
          <h2>Sign in to see your subscriptions</h2>
          <button type='button' className='sign-in' onClick={signIn}>
            <CircleUserRound size={24} strokeWidth={1.5} />
            Sign in
          </button>
        </div>
      </main>
    )
  }

  return (
    <main css={style}>
      <h1 className='heading'>Subscriptions</h1>
      <div className='filters'>
        <div className='chips' role='group' aria-label='Groups'>
          <button type='button' className='chip' aria-pressed={!group} onClick={() => setGroupId(undefined)}>All</button>
          {groups.map(candidate => (
            <button
              key={candidate.id}
              type='button'
              className='chip'
              aria-pressed={candidate.id === group?.id}
              onClick={() => setGroupId(candidate.id)}
            >
              <span className='emoji' aria-hidden='true'>{candidate.emoji}</span>
              {candidate.name}
            </button>
          ))}
          <Link href='/feed/groups' className='manage'>Manage</Link>
        </div>
        <label className='toggle'>
          <input type='checkbox' checked={hideLive} onChange={() => setHideLive(value => !value)} />
          Hide live
        </label>
        <label className='toggle'>
          <input type='checkbox' checked={hideWatched} onChange={() => setHideWatched(value => !value)} />
          Hide watched
        </label>
      </div>
      {data && !fetching && !error && shown.length === 0 && (stalled || !cursor)
        ? (
          <div className='card'>
            <h2>No new videos</h2>
          </div>
        )
        : <VideoGrid videos={shown} fetching={fetching && shown.length === 0} />}
      {fetching && shown.length > 0 ? <p className='notice'>Loading more…</p> : undefined}
      {error && !fetching ? <DataFailure error={error} reexecute={reexecute} /> : undefined}
      {/* paging on its own stops after pages that held nothing to show, and goes on from here one page at a time */}
      {stalled && cursor && !fetching && !error
        ? <button type='button' className='more' onClick={onMore}>Load more</button>
        : undefined}
      <FeedSentinel onVisible={onMore} disabled={fetching || Boolean(error) || !cursor || stalled} />
    </main>
  )
}

export default SubscriptionsFeedPage

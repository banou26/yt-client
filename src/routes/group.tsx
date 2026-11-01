import type { ChannelUploadsQuery } from '../generated/graphql'
import type { UploadSort } from '../groups/uploads'

import { css } from '@emotion/react'
import { Pencil } from 'lucide-react'
import { useEffect, useState } from 'preact/hooks'
import { useClient } from 'urql'

import { useDocumentTitle } from '../app'
import { formatAgo, formatCount, safeDecode } from '../components/format'
import GroupDialog from '../components/group-dialog'
import { FeedSentinel } from '../components/use-infinite-feed'
import { VideoGrid } from '../components/video-grid'
import { gql } from '../generated'
import { useGroups } from '../groups/store'
import { mergeUploads } from '../groups/uploads'

// the feed has no duration, live state or avatar, and Video is keyed by id: selecting those would write nulls over other views
const CHANNEL_UPLOADS_QUERY = gql(`
  query ChannelUploads($channelId: ID!) {
    channelUploads(channelId: $channelId) {
      id
      title
      thumbnail
      viewCount
      publishedAt
    }
  }
`)

type Upload = ChannelUploadsQuery['channelUploads'][number]

type ChannelResult = { uploads: Upload[] } | { failed: true }

const PAGE_SIZE = 60

const FAILED_NAMES_SHOWN = 3

const SORTS: { value: UploadSort, label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'popular', label: 'Popular' },
]

const style = css`
  padding: 2.4rem 1.6rem;

  .top {
    display: flex;
    align-items: center;
    gap: 1.6rem;
  }

  .icon {
    flex: none;
    width: 6.4rem;
    height: 6.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--bg-chip);
    font-size: 3.2rem;
  }

  .info {
    flex: 1;
    min-width: 0;
  }

  .name {
    margin: 0;
    font-size: 2.8rem;
    font-weight: 700;
    line-height: 3.6rem;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    margin-top: 0.4rem;
    font-size: 1.4rem;
    color: var(--text-secondary);
  }

  .edit {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    height: 3.6rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 1.8rem;
    background: var(--bg-chip);
    color: var(--text-primary);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .edit:hover {
    background: var(--bg-chip-hover);
  }

  .sorts {
    display: flex;
    gap: 0.8rem;
    margin: 2.4rem 0;
  }

  .sort {
    height: 3.2rem;
    padding: 0 1.2rem;
    border: none;
    border-radius: 0.8rem;
    background: var(--bg-chip);
    color: var(--text-primary);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .sort:hover {
    background: var(--bg-chip-hover);
  }

  .sort.active {
    background: var(--bg-inverse);
    color: var(--text-inverse);
  }

  .notice {
    margin: 0 0 2.4rem;
    font-size: 1.4rem;
    color: var(--text-secondary);
  }

  .not-found {
    color: var(--text-secondary);
  }
`

/** Each channel's uploads as they land, asked again on every visit and shown from the cache meanwhile. */
const useChannelUploads = (channelIds: string[]) => {
  const client = useClient()
  const [results, setResults] = useState<Record<string, ChannelResult>>({})
  const key = channelIds.join(',')

  useEffect(() => {
    const subscriptions = channelIds.map(channelId => client
      .query(CHANNEL_UPLOADS_QUERY, { channelId }, { requestPolicy: 'cache-and-network' })
      .subscribe((result) => {
        const uploads = result.data?.channelUploads
        if (!uploads && !result.error) return
        setResults(current => ({ ...current, [channelId]: uploads ? { uploads } : { failed: true } }))
      }))
    return () => {
      for (const subscription of subscriptions) subscription.unsubscribe()
    }
  }, [client, key])

  return results
}

const failedLine = (names: string[]) => {
  const shown = names.slice(0, FAILED_NAMES_SHOWN).join(', ')
  const rest = names.length - FAILED_NAMES_SHOWN
  return `Could not load ${shown}${rest > 0 ? ` and ${rest} more` : ''}`
}

const GroupPage = ({ params }: { params: { id: string } }) => {
  const groups = useGroups()
  const group = groups.find(candidate => candidate.id === safeDecode(params.id))
  useDocumentTitle(group?.name ?? 'Group')
  const [sort, setSort] = useState<UploadSort>('latest')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [editing, setEditing] = useState(false)
  const channels = group?.channels ?? []
  const results = useChannelUploads(channels.map(channel => channel.id))

  if (!group) {
    return (
      <main css={style}>
        <p className='not-found'>Group not found</p>
      </main>
    )
  }

  const videos = mergeUploads(
    channels.map((channel) => {
      const result = results[channel.id]
      if (!result || 'failed' in result) return []
      return result.uploads.map(upload => ({ ...upload, publishedText: formatAgo(upload.publishedAt), channel }))
    }),
    sort,
  )
  const pending = channels.filter(channel => !results[channel.id]).length
  const failed = channels.filter(channel => {
    const result = results[channel.id]
    return result !== undefined && 'failed' in result
  })

  return (
    <main css={style}>
      <div className='top'>
        <span className='icon' aria-hidden='true'>{group.emoji}</span>
        <div className='info'>
          <h1 className='name'>{group.name}</h1>
          <div className='meta'>{formatCount(channels.length, 'channel')}</div>
        </div>
        <button type='button' className='edit' onClick={() => setEditing(true)}>
          <Pencil size={18} strokeWidth={1.5} />
          Edit
        </button>
      </div>
      <div className='sorts' role='group' aria-label='Sort by'>
        {SORTS.map(option => (
          <button
            key={option.value}
            type='button'
            className={option.value === sort ? 'sort active' : 'sort'}
            aria-pressed={option.value === sort}
            onClick={() => setSort(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {failed.length > 0 ? <p className='notice'>{failedLine(failed.map(channel => channel.name))}</p> : undefined}
      {channels.length === 0 ? <p className='notice'>No channels in this group</p> : undefined}
      <VideoGrid videos={videos.slice(0, shown)} fetching={pending > 0 && videos.length <= shown} />
      <FeedSentinel onVisible={() => setShown(count => count + PAGE_SIZE)} disabled={videos.length <= shown} />
      {editing ? <GroupDialog group={group} onClose={() => setEditing(false)} /> : undefined}
    </main>
  )
}

export default GroupPage

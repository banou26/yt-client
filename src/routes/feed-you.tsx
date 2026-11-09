import type { ComponentChildren } from 'preact'

import type { VideoCardData } from '../components/video-card'

import { css } from '@emotion/react'
import { CircleUserRound } from 'lucide-react'
import { useQuery } from 'urql'
import { Link } from 'wouter'

import { useDocumentTitle } from '../app'
import { LIKED_VIDEOS_ID, playlistHrefFor, WATCH_LATER_ID } from '../components/playlist'
import { PlaylistCard } from '../components/playlist-card'
import { VideoCard } from '../components/video-card'
import { gql } from '../generated'
import { useSession } from '../session'
import { signIn } from '../sign-in'

const YOU_HISTORY_QUERY = gql(`
  query YouHistory {
    history {
      sections {
        items {
          id
          title
          thumbnail
          thumbnailSrcset
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
      }
    }
  }
`)

// the same fields LibraryPlaylists selects: Playlist is keyed by id, so a field left null here would overwrite one a fuller read stored
const YOU_PLAYLISTS_QUERY = gql(`
  query YouPlaylists {
    playlists {
      items {
        id
        title
        thumbnail
        videoCountText
        channel { id name }
      }
    }
  }
`)

const YOU_PLAYLIST_QUERY = gql(`
  query YouPlaylist($id: ID!) {
    playlist(id: $id) {
      playlist { id }
      items {
        video {
          id
          title
          thumbnail
          thumbnailSrcset
          durationSeconds
          viewCount
          publishedText
          isLive
          channel { id name isVerified isVerifiedArtist }
        }
      }
    }
  }
`)

const SHELF_SIZE = 12

const style = css`
  padding: 2.4rem 1.6rem;

  .shelf + .shelf {
    margin-top: 3.2rem;
  }

  .shelf-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.6rem;
    margin-bottom: 1.6rem;
  }

  .shelf-title {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .view-all {
    display: inline-flex;
    align-items: center;
    height: 3.6rem;
    padding: 0 1.6rem;
    border: 1px solid var(--border-strong);
    border-radius: 1.8rem;
    color: var(--text-primary);
    font-size: 1.4rem;
    font-weight: 500;
    transition: background 0.15s ease;
  }

  .view-all:hover {
    background: var(--bg-hover);
  }

  .row {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(21rem, 1fr);
    grid-template-columns: repeat(auto-fill, minmax(21rem, 1fr));
    gap: 1.6rem;
    overflow-x: auto;
    padding-bottom: 0.8rem;
  }

  .empty {
    margin: 0;
    font-size: 1.4rem;
    color: var(--text-secondary);
  }

  .prompt {
    max-width: 56rem;
    margin: 4.8rem auto 0;
    padding: 2.4rem;
    border-radius: 1.2rem;
    background: var(--bg-subtle);
    text-align: center;
  }

  .prompt h2 {
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

const Shelf = (
  { title, href, empty, emptyText = 'No videos', children }: {
    title: string
    href: string
    empty: boolean
    emptyText?: string
    children: ComponentChildren
  },
) => (
  <section className='shelf' aria-label={title}>
    <div className='shelf-head'>
      <h2 className='shelf-title'>{title}</h2>
      <Link href={href} className='view-all'>View all</Link>
    </div>
    {empty ? <p className='empty'>{emptyText}</p> : <div className='row'>{children}</div>}
  </section>
)

const VideoShelf = ({ title, href, videos, fetching }: { title: string, href: string, videos: VideoCardData[], fetching: boolean }) => (
  <Shelf title={title} href={href} empty={!fetching && videos.length === 0}>
    {videos.slice(0, SHELF_SIZE).map(video => <VideoCard key={video.id} video={video} />)}
  </Shelf>
)

// no shelf for an empty answer: the playlist reader cannot read LockupView items yet, so a full list can come back empty and 'No videos' would be wrong
const PlaylistShelf = ({ id, title }: { id: string, title: string }) => {
  const [{ data, fetching }] = useQuery({ query: YOU_PLAYLIST_QUERY, variables: { id } })
  const videos = (data?.playlist.items ?? []).map(item => item.video)
  if (!fetching && videos.length === 0) return null
  return <VideoShelf title={title} href={playlistHrefFor(id)} videos={videos} fetching={fetching} />
}

const SignedInYou = () => {
  const [{ data: history, fetching: historyFetching }] = useQuery({ query: YOU_HISTORY_QUERY })
  const [{ data: library, fetching: libraryFetching }] = useQuery({ query: YOU_PLAYLISTS_QUERY })
  const watched = (history?.history.sections ?? []).flatMap(section => section.items)
  const playlists = (library?.playlists.items ?? [])
    .filter(playlist => playlist.id !== WATCH_LATER_ID && playlist.id !== LIKED_VIDEOS_ID)
    .slice(0, SHELF_SIZE)

  return (
    <>
      <VideoShelf title='History' href='/feed/history' videos={watched} fetching={historyFetching} />
      <Shelf title='Playlists' href='/feed/playlists' empty={!libraryFetching && playlists.length === 0} emptyText='No playlists'>
        {playlists.map(playlist => (
          <PlaylistCard
            key={playlist.id}
            id={playlist.id}
            title={playlist.title}
            thumbnail={playlist.thumbnail}
            videoCountText={playlist.videoCountText}
            channelName={playlist.channel?.name}
          />
        ))}
      </Shelf>
      <PlaylistShelf id={WATCH_LATER_ID} title='Watch later' />
      <PlaylistShelf id={LIKED_VIDEOS_ID} title='Liked videos' />
    </>
  )
}

const YouPage = () => {
  useDocumentTitle('You')
  const { ready, signedIn } = useSession()

  return (
    <main css={style}>
      {ready && !signedIn
        ? (
          <div className='prompt'>
            <h2>Enjoy your favorite videos</h2>
            <button type='button' className='sign-in' onClick={signIn}>
              <CircleUserRound size={24} strokeWidth={1.5} />
              Sign in
            </button>
          </div>
        )
        : undefined}
      {ready && signedIn ? <SignedInYou /> : undefined}
    </main>
  )
}

export default YouPage

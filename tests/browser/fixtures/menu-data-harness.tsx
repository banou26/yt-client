import type { SourceApi } from '../../../src/sources/types'

import { createSchema, createYoga } from 'graphql-yoga'
import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import GroupDialog from '../../../src/components/group-dialog'
import NotificationsMenu from '../../../src/components/notifications-menu'
import { SaveMenu } from '../../../src/components/save-menu'
import SubscribeButton from '../../../src/components/subscribe-button'
import { TranscriptPanel } from '../../../src/components/transcript'
import { VideoCardMenu } from '../../../src/components/video-card'
import { createCache } from '../../../src/graphql'
import { resolvers } from '../../../src/worker/resolvers'
import typeDefs from '../../../src/worker/schema.gql?raw'

export type Which = 'notifications' | 'save' | 'row' | 'group' | 'subscribe' | 'transcript'

// every read and every action asks here and fails as the answer a spec routes here does
const DATA_PATH = '/menu-data-harness/'

// what each call asks youtube.com, and youtubei.js's words for an answer that is not ok, which the resolvers pass on
const request = async <T,>(endpoint: string, answer: T) => {
  const response = await fetch(`${DATA_PATH}${endpoint}`)
  if (!response.ok) throw new Error(`Request to https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false&alt=json failed with status code ${response.status}`)
  return answer
}

const lines = [{ startSeconds: 0, timestamp: '0:00', text: 'Line 1' }]

const source = {
  session: async () => ({ signedIn: true, name: 'Viewer', accounts: [] }),
  unseenNotificationCount: async () => 0,
  notifications: (cursor?: string) => request('notification/get_notification_menu', cursor
    ? { items: [{ id: 'notification-2', message: 'Channel 2 uploaded: Video 2', sentText: '2 days ago', read: true }] }
    : { items: [{ id: 'notification-1', message: 'Channel 1 uploaded: Video 1', sentText: '1 hour ago', read: false }], cursor: 'notifications-2' }),
  playlists: (cursor?: string) => request('browse', cursor
    ? { items: [{ id: 'PL-2', title: 'Playlist 2', videoCountText: '2 videos' }] }
    : { items: [{ id: 'PL-1', title: 'Playlist 1', videoCountText: '1 video' }], cursor: 'playlists-2' }),
  subscribedChannels: () => request('browse', [{ id: 'UC-1', name: 'Channel 1' }]),
  transcript: () => request('get_transcript', { sections: [{ lines }], searchToken: 'transcript-search' }),
  transcriptSearch: () => request('get_transcript', { sections: [{ lines }] }),
  markNotificationRead: (id: string) => request('notification/record_interactions', id),
  addToPlaylist: (id: string) => request('browse/edit_playlist', { id, title: 'Playlist 1' }),
  createPlaylist: (title: string) => request('playlist/create', { id: 'PL-3', title }),
  setSubscribed: (id: string, isSubscribed: boolean) => request('subscription/subscribe', { id, name: 'Channel 1', isSubscribed }),
} as unknown as SourceApi

/**
 * Renders a menu, dialog, button or panel that reads the signed-in account's data or acts on it, through the app's own
 * schema, resolvers and cache, over a source whose every call asks DATA_PATH. Served by the dev server and imported
 * from a spec.
 */
export const mountMenuData = (which: Which) => {
  const host = document.createElement('div')
  host.setAttribute('data-menu-data-harness', which)
  host.style.cssText = 'position: fixed; inset: 6rem 2rem auto auto; z-index: 10000; display: flex; justify-content: flex-end; width: 60rem; background: var(--bg)'
  document.body.append(host)
  const yoga = createYoga<{ source: SourceApi }>({
    graphqlEndpoint: '/graphql',
    maskedErrors: false,
    schema: createSchema({ typeDefs, resolvers }),
  })
  const client = new Client({
    url: 'http://menu-data-harness.local/graphql',
    exchanges: [createCache(), fetchExchange],
    fetch: async (input, init) => yoga.handleRequest(new Request(input, init), { source }),
  })
  // useSession reads only once the engine is up
  document.documentElement.dataset.engine = 'ready'
  const close = () => render(null, host)
  const shown = {
    notifications: () => <NotificationsMenu />,
    save: () => <SaveMenu videoId='video-0' />,
    row: () => <VideoCardMenu videoId='video-0' title='Video 0' />,
    group: () => <GroupDialog onClose={close} />,
    subscribe: () => <SubscribeButton channelId='UC-1' subscribed={false} />,
    transcript: () => <TranscriptPanel videoId='video-0' panel={{ panelId: 'transcript-panel', params: 'transcript-params' }} onClose={close} />,
  }[which]
  render(<Provider value={client}>{shown()}</Provider>, host)
}

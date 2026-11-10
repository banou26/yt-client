import type { SourceApi } from '../../../src/sources/types'

import { createSchema, createYoga } from 'graphql-yoga'
import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import GroupDialog from '../../../src/components/group-dialog'
import NotificationsMenu from '../../../src/components/notifications-menu'
import { SaveMenu } from '../../../src/components/save-menu'
import { VideoCardMenu } from '../../../src/components/video-card'
import { createCache } from '../../../src/graphql'
import { resolvers } from '../../../src/worker/resolvers'
import typeDefs from '../../../src/worker/schema.gql?raw'

export type Which = 'notifications' | 'save' | 'row' | 'group'

// every read asks here and fails as the answer a spec routes here does
const DATA_PATH = '/menu-data-harness/'

// what each read asks youtube.com, and youtubei.js's words for an answer that is not ok, which the resolvers pass on
const read = async <T,>(endpoint: string, answer: T) => {
  const response = await fetch(`${DATA_PATH}${endpoint}`)
  if (!response.ok) throw new Error(`Request to https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false&alt=json failed with status code ${response.status}`)
  return answer
}

const source = {
  session: async () => ({ signedIn: true, name: 'Viewer', accounts: [] }),
  unseenNotificationCount: async () => 0,
  notifications: (cursor?: string) => read('notification/get_notification_menu', cursor
    ? { items: [{ id: 'notification-2', message: 'Channel 2 uploaded: Video 2', sentText: '2 days ago', read: true }] }
    : { items: [{ id: 'notification-1', message: 'Channel 1 uploaded: Video 1', sentText: '1 hour ago', read: false }], cursor: 'notifications-2' }),
  playlists: (cursor?: string) => read('browse', cursor
    ? { items: [{ id: 'PL-2', title: 'Playlist 2', videoCountText: '2 videos' }] }
    : { items: [{ id: 'PL-1', title: 'Playlist 1', videoCountText: '1 video' }], cursor: 'playlists-2' }),
  subscribedChannels: () => read('browse', [{ id: 'UC-1', name: 'Channel 1' }]),
} as unknown as SourceApi

/**
 * Renders a menu or dialog that reads the signed-in account's data, through the app's own schema, resolvers and cache,
 * over a source whose every read asks DATA_PATH. Served by the dev server and imported from a spec.
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
  const shown = which === 'notifications'
    ? <NotificationsMenu />
    : which === 'save'
      ? <SaveMenu videoId='video-0' />
      : which === 'row'
        ? <VideoCardMenu videoId='video-0' title='Video 0' />
        : <GroupDialog onClose={() => render(null, host)} />
  render(<Provider value={client}>{shown}</Provider>, host)
}

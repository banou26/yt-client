import type { GroupSync } from './sync'

import { startPlatform } from '../scramjet/platform'
import { groupStore } from './store'
import { groupSync } from './sync'

/**
 * @fkn/lib's account and cloud storage. Imported only once the platform has mounted the broker frame, which the lib
 * adopts as it loads: imported earlier, it would mount a second one that is not the overlay host.
 */
export const fknLib = async () => {
  await startPlatform()
  const [account, fs] = await Promise.all([import('@fkn/lib/account'), import('@fkn/lib/cloud/fs')])
  return { account, fs }
}

export type FknLib = Awaited<ReturnType<typeof fknLib>>

const REFRESH_MS = 3 * 60_000

let started: Promise<GroupSync> | undefined

/** Keeps the groups in step with the FKN account signed in, from now on. A start that failed is tried again on the next call. */
export const startGroupSync = (): Promise<GroupSync> => started ??= fknLib().then(({ account, fs }) => {
  const sync = groupSync({
    store: groupStore,
    cloud: {
      availability: () => fs.availability(),
      unlocked: async () => (await fs.encryption()).unlocked,
      read: path => fs.promises.readFile(path, { encoding: 'utf8' }).then(
        text => typeof text === 'string' ? text : new TextDecoder().decode(text),
        (error: unknown) => {
          if (fs.isNotFound(error)) return null
          throw error
        },
      ),
      write: (path, text) => fs.promises.writeFile(path, text),
    },
    onAccountChange: account.onChange,
    // navigator.locks exists only in a secure context
    lock: work => 'locks' in navigator ? navigator.locks.request('yt-client:groups', work) : work(),
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync.check()
  })
  window.addEventListener('online', () => void sync.check())
  // two windows both in view see each other's edits without either being hidden
  setInterval(() => {
    if (document.visibilityState === 'visible') void sync.check()
  }, REFRESH_MS)
  void sync.check()
  return sync
}, (error: unknown) => {
  started = undefined
  throw error
})

/** Runs a sync step now, starting the sync first when it has not started. */
export const checkGroups = () => startGroupSync().then(sync => sync.check())

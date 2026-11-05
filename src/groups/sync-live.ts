import type { GroupSync } from './sync'

import { startPlatform } from '../scramjet/platform'
import { groupStore } from './store'
import { FKN_BOUND_MS, groupSync, within } from './sync'

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

/**
 * Whether this page is signed in to FKN and has to unlock its storage, or undefined when FKN did not answer.
 * `account.info()` cannot tell: it answers null for a sign out and for any failure alike.
 */
export const fknStatus = async (fs: Pick<FknLib['fs'], 'availability' | 'encryption'>) => {
  const availability = await fs.availability()
  if (availability === 'unknown') return undefined
  const encryption = availability === 'connected' ? await within(FKN_BOUND_MS, () => fs.encryption(), () => undefined) : undefined
  return { signedIn: availability === 'connected', locked: !!encryption && !encryption.unlocked && encryption.enrolled }
}

const REFRESH_MS = 3 * 60_000

let started: Promise<GroupSync> | undefined

/**
 * Keeps the groups in step with the FKN account signed in, from now on. A start that could not load the lib is tried
 * again on the next call; one without navigator.locks never starts.
 */
export const startGroupSync = (): Promise<GroupSync> => started ??= fknLib().then(({ account, fs }) => {
  // only a secure context has navigator.locks, and without it two tabs' steps could undo each other's writes
  if (!('locks' in navigator)) throw new Error('groups: no navigator.locks, so no FKN account sync')
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
    lock: work => navigator.locks.request('yt-client:groups', work),
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

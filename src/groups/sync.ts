import type { Deleted, Group, GroupStore, GroupsSync } from './store'

import { E2E_RETIRED_FORMAT_MESSAGE, E2E_STALE_EPOCH_MESSAGE } from '@fkn/lib/messages'

import { coerceGroups, coerceSync } from './store'

/**
 * The account's groups: one file, which FKN seals in this browser before it is stored.
 *
 * A new group field moves the file to groups/v2, which reads v1 once: a build that does not know the field would
 * otherwise write the file back without it.
 */
export const GROUPS_PATH = 'groups/v1/groups.json'

/** The file. `file` is a random id minted with it, so a browser can tell another account's groups from this one's. */
export type GroupsFile = { file: string, groups: Group[], deleted: Deleted }

type Side = { groups: Group[], deleted: Deleted }

const NONE: Side = { groups: [], deleted: {} }

/**
 * One list out of two copies. Per group the later `updatedAt` wins, `theirs` on a tie, and a deletion wins over a copy
 * not edited after it. The order is `theirs`, then the groups only `ours` holds.
 */
export const mergeGroups = (theirs: Side, ours: Side): Side => {
  const deleted = { ...theirs.deleted }
  for (const [id, at] of Object.entries(ours.deleted)) deleted[id] = Math.max(deleted[id] ?? 0, at)
  const byId = new Map<string, Group>()
  for (const group of [...theirs.groups, ...ours.groups]) {
    const kept = byId.get(group.id)
    if (!kept || group.updatedAt > kept.updatedAt) byId.set(group.id, group)
  }
  const live = (group: Group) => !(group.id in deleted) || group.updatedAt > deleted[group.id]!
  return { groups: [...byId.values()].filter(live), deleted }
}

const unreadable = () => new Error('groups: the account file is not one this build reads')

/** Throws on a file this build cannot read, never with JSON.parse's own message, which quotes the decrypted text. */
export const parseGroupsFile = (text: string): GroupsFile => {
  let value: Record<string, unknown> | null
  try {
    value = JSON.parse(text) as Record<string, unknown> | null
  } catch {
    throw unreadable()
  }
  if (typeof value?.file !== 'string' || !value.file) throw unreadable()
  return { file: value.file, groups: coerceGroups(value.groups), deleted: coerceSync({ deleted: value.deleted }).deleted }
}

// sealed under a key the account has since reset, or in an envelope the lib no longer opens: no read ever opens it
// again. An integrity failure is not one of them, so that file is never written over.
const GONE_FOR_GOOD = [E2E_STALE_EPOCH_MESSAGE, E2E_RETIRED_FORMAT_MESSAGE].map(message => message.split(': ')[0]!)

const goneForGood = (error: unknown) =>
  error instanceof Error && GONE_FOR_GOOD.some(code => error.message.startsWith(code))

/**
 * Runs `work()` in this synchronous step, so @fkn/lib pins the call to the account the caller just checked. Past
 * `ms`, or on a throw, it answers `orElse()` when given, and otherwise rejects.
 */
export const within = <T>(ms: number, work: () => Promise<T>, orElse?: () => T): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => orElse ? resolve(orElse()) : reject(new Error('groups: FKN did not answer')), ms)
    new Promise<T>(called => called(work())).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        if (orElse) resolve(orElse())
        else reject(error)
      },
    )
  })

/** How long any FKN call may take before it counts as no answer. */
export const FKN_BOUND_MS = 8_000

/** FKN storage as the sync calls it, unbounded: groupSync bounds each call. */
export type GroupsCloud = {
  availability: () => Promise<'connected' | 'disconnected' | 'unknown'>
  /** Whether this browser holds the key the account's files are sealed with. Raises nothing. */
  unlocked: () => Promise<boolean>
  /** The file's text, or null when the account has none. */
  read: (path: string) => Promise<string | null>
  write: (path: string, text: string) => Promise<void>
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Keeps `store` in step with the groups file of the FKN account signed in.
 *
 * Signed out of FKN, the groups are this browser's own. Once the account's file can be read, they are merged into
 * it, and from then on the list is the account's. Signing out of FKN takes the account's groups out of this browser.
 * A list last merged with another account's file is dropped, never merged into this one. A step that heard of an
 * account change keeps nothing, and one that found the list changed under it leaves it to the next step.
 */
export const groupSync = ({ store, cloud, onAccountChange, lock, newId = () => crypto.randomUUID(), boundMs = FKN_BOUND_MS }: {
  store: Pick<GroupStore, 'persists' | 'snapshot' | 'settle' | 'onEdit'>
  cloud: GroupsCloud
  /** `account.onChange` of the @fkn/lib realm `cloud` calls. */
  onAccountChange: (listener: (change?: { switched: boolean }) => void) => unknown
  /** One step at a time across every tab of the origin. */
  lock: (work: () => Promise<void>) => Promise<void>
  newId?: () => string
  boundMs?: number
}) => {
  let generation = 0

  const step = async () => {
    // without storage the snapshot cannot see this tab's edits, and settling would undo them
    if (!store.persists()) return
    const began = generation
    const current = () => generation === began

    // FKN not answering reads as "could not tell", never as a sign out
    const availability = await within(boundMs, cloud.availability, () => 'unknown' as const)
    if (availability === 'unknown' || !current()) return
    const before = store.snapshot()
    if (availability === 'disconnected') {
      // the account's groups leave with it, and deletions only matter while there is an account copy to merge
      if (before.file || Object.keys(before.deleted).length > 0) store.settle(before.file ? [] : before.groups, { deleted: {} })
      return
    }

    // a sealed read with no key held raises FKN's card, which only a click may do
    if (!await within(boundMs, cloud.unlocked, () => false) || !current()) return
    let text: string | null = null
    let gone = false
    try {
      text = await within(boundMs, () => cloud.read(GROUPS_PATH))
    } catch (error) {
      if (!goneForGood(error)) throw error
      gone = true
    }
    const theirs = text === null ? undefined : parseGroupsFile(text)
    // another account's list, or one whose file was deleted or can no longer be opened, is never merged into this one
    const ours = before.file && before.file !== theirs?.file ? NONE : before
    const merged = mergeGroups(theirs ?? NONE, ours)
    const file = theirs?.file ?? newId()
    const changed = gone || (theirs
      ? !same({ file, ...merged }, theirs)
      : merged.groups.length > 0 || Object.keys(merged.deleted).length > 0)
    let held = theirs !== undefined
    if (changed) {
      // the read that found the file gone drops a key from before a reset, and a write with none raises FKN's card
      if (gone && !await within(boundMs, cloud.unlocked, () => false)) return
      if (!current()) return
      await within(boundMs, () => cloud.write(GROUPS_PATH, JSON.stringify({ file, ...merged })))
      held = true
    }
    if (!current()) return
    if (!same(store.snapshot(), before)) {
      void start()
      return
    }
    const sync: GroupsSync = held ? { file, deleted: merged.deleted } : { deleted: merged.deleted }
    store.settle(merged.groups, sync)
  }

  let queued: Promise<void> | undefined
  const start = (): Promise<void> => queued ??= lock(() => {
    queued = undefined
    return step()
  }).catch((error: unknown) => console.warn('groups: FKN account sync', error))

  store.onEdit(() => void start())
  void onAccountChange((change) => {
    // false: the same account, its connection renewed
    if (change?.switched !== false) generation += 1
    void start()
  })

  return { check: start }
}

export type GroupSync = ReturnType<typeof groupSync>

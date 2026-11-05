import { useEffect, useState } from 'preact/hooks'

import { isChannelId } from '../sources/youtube/channel-feed'

/** A channel as a group keeps it: enough to draw it without asking YouTube. */
export type GroupChannel = { id: string, name: string, avatar?: string }

/** A named set of channels. Groups are flat. `updatedAt` (ms) decides which copy wins when two browsers edited it. */
export type Group = { id: string, name: string, emoji: string, channels: GroupChannel[], updatedAt: number }

export type GroupFields = { name: string, emoji?: string, channels?: GroupChannel[] }

export const GROUPS_KEY = 'yt-client:groups'

/** The groups' link to the FKN account, src/groups/sync.ts's to keep. */
export const GROUPS_SYNC_KEY = 'yt-client:groups-sync'

/** When each deleted group went, by id, so a copy of it elsewhere does not bring it back. */
export type Deleted = Record<string, number>

/** `file` is the id of the account file this list was last read from, absent while the list is this browser's own. */
export type GroupsSync = { file?: string, deleted: Deleted }

export const groupHrefFor = (groupId: string) => `/feed/groups/${encodeURIComponent(groupId)}`

export const DEFAULT_EMOJI = '📁'

export const NAME_LIMIT = 100

const text = (value: unknown, limit: number) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, limit) : undefined

const coerceChannel = (value: unknown): GroupChannel | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const { id, name, avatar } = value as Record<string, unknown>
  const label = text(name, NAME_LIMIT)
  if (typeof id !== 'string' || !isChannelId(id) || !label) return undefined
  return typeof avatar === 'string' && /^(https:)?\/\//.test(avatar) ? { id, name: label, avatar } : { id, name: label }
}

const uniqueById = <Item extends { id: string }>(items: (Item | undefined)[]) => {
  const byId = new Map<string, Item>()
  for (const item of items) if (item && !byId.has(item.id)) byId.set(item.id, item)
  return [...byId.values()]
}

const coerceGroup = (value: unknown): Group | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const { id, name, emoji, channels, updatedAt } = value as Record<string, unknown>
  const groupId = text(id, 64)
  const label = text(name, NAME_LIMIT)
  if (!groupId || !label) return undefined
  return {
    id: groupId,
    name: label,
    emoji: text(emoji, 16) ?? DEFAULT_EMOJI,
    channels: Array.isArray(channels) ? uniqueById(channels.map(coerceChannel)) : [],
    updatedAt: typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : 0,
  }
}

/** Groups out of anything: storage is user-editable, so each bad group or channel drops alone and the rest stand. */
export const coerceGroups = (value: unknown): Group[] =>
  Array.isArray(value) ? uniqueById(value.map(coerceGroup)) : []

export const coerceSync = (value: unknown): GroupsSync => {
  const { file, deleted } = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const kept: Deleted = {}
  if (deleted && typeof deleted === 'object') {
    for (const [id, at] of Object.entries(deleted)) if (typeof at === 'number' && Number.isFinite(at)) kept[id] = at
  }
  return typeof file === 'string' && file ? { file, deleted: kept } : { deleted: kept }
}

// later than the copy it replaces whatever this clock says, or a slow clock's edit would lose to the one before it
const stamp = (after = 0) => Math.max(Date.now(), after + 1)

export type GroupStore = ReturnType<typeof createGroupStore>

/**
 * The groups kept under `yt-client:groups` in `storage`, with every change, this tab's or another tab's (the
 * `storage` event on `events`), handed to subscribers. Without storage, or once it refused a write, the groups live
 * in memory only and `persists()` says false.
 */
export const createGroupStore = (storage?: Storage, events?: EventTarget) => {
  const readJson = (key: string, fallback: string): unknown => {
    try {
      return JSON.parse(storage?.getItem(key) ?? fallback)
    } catch {
      return undefined
    }
  }
  const readGroups = () => coerceGroups(readJson(GROUPS_KEY, '[]'))
  const readSync = () => coerceSync(readJson(GROUPS_SYNC_KEY, '{}'))

  let current = readGroups()
  let sync = readSync()
  let persists = storage !== undefined
  const listeners = new Set<(groups: Group[]) => void>()
  const edits = new Set<() => void>()
  const publish = () => {
    for (const listener of listeners) listener(current)
  }

  const save = (groups: Group[], next: GroupsSync) => {
    current = groups
    sync = next
    try {
      storage?.setItem(GROUPS_KEY, JSON.stringify(groups))
      storage?.setItem(GROUPS_SYNC_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable (private mode, quota): the in-memory value still stands
      persists = false
    }
    publish()
  }
  const edit = (groups: Group[], next = sync) => {
    save(groups, next)
    for (const listener of edits) listener()
  }

  events?.addEventListener('storage', (event) => {
    const key = (event as StorageEvent).key
    // a null key is the other tab clearing the whole storage
    if (key !== null && key !== GROUPS_KEY && key !== GROUPS_SYNC_KEY) return
    current = readGroups()
    sync = readSync()
    publish()
  })

  const update = (id: string, change: (group: Group) => Group) =>
    edit(current.map(group => group.id === id ? coerceGroup({ ...change(group), updatedAt: stamp(group.updatedAt) }) ?? group : group))

  return {
    getGroups: () => current,
    subscribe: (listener: (groups: Group[]) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    createGroup: (fields: GroupFields) => {
      const group = coerceGroup({ id: crypto.randomUUID(), ...fields, updatedAt: stamp() })
      if (!group) throw new Error('A group needs a name')
      edit([...current, group])
      return group
    },
    updateGroup: (id: string, fields: Partial<GroupFields>) => update(id, group => ({ ...group, ...fields })),
    deleteGroup: (id: string) => {
      const gone = current.find(group => group.id === id)
      if (!gone) return
      edit(current.filter(group => group.id !== id), { ...sync, deleted: { ...sync.deleted, [id]: stamp(gone.updatedAt) } })
    },
    setChannel: (groupId: string, channel: GroupChannel, included: boolean) => update(groupId, group => ({
      ...group,
      channels: included
        ? [...group.channels.filter(kept => kept.id !== channel.id), channel]
        : group.channels.filter(kept => kept.id !== channel.id),
    })),
    persists: () => persists,
    /** What src/groups/sync.ts merges, read from storage so that another tab's change is in it. */
    snapshot: () => ({ groups: readGroups(), ...readSync() }),
    /** Keeps what a sync step settled on, without counting it as an edit. */
    settle: (groups: Group[], next: GroupsSync) => save(groups, next),
    /** Told after every edit made in this tab. */
    onEdit: (listener: () => void) => {
      edits.add(listener)
      return () => {
        edits.delete(listener)
      }
    },
  }
}

const browserStorage = () => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export const groupStore = typeof window === 'undefined'
  ? createGroupStore()
  : createGroupStore(browserStorage(), window)

export const useGroups = () => {
  const [groups, setGroups] = useState(groupStore.getGroups)
  useEffect(() => {
    setGroups(groupStore.getGroups())
    return groupStore.subscribe(setGroups)
  }, [])
  return groups
}

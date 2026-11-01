import { useEffect, useState } from 'preact/hooks'

import { isChannelId } from '../sources/youtube/channel-feed'

/** A channel as a group keeps it: enough to draw it without asking YouTube. */
export type GroupChannel = { id: string, name: string, avatar?: string }

/** A named set of channels. Groups are flat, and kept on this device only. */
export type Group = { id: string, name: string, emoji: string, channels: GroupChannel[] }

export type GroupFields = { name: string, emoji?: string, channels?: GroupChannel[] }

export const GROUPS_KEY = 'yt-client:groups'

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
  const { id, name, emoji, channels } = value as Record<string, unknown>
  const groupId = text(id, 64)
  const label = text(name, NAME_LIMIT)
  if (!groupId || !label) return undefined
  return {
    id: groupId,
    name: label,
    emoji: text(emoji, 16) ?? DEFAULT_EMOJI,
    channels: Array.isArray(channels) ? uniqueById(channels.map(coerceChannel)) : [],
  }
}

/** Groups out of anything: storage is user-editable, so each bad group or channel drops alone and the rest stand. */
export const coerceGroups = (value: unknown): Group[] =>
  Array.isArray(value) ? uniqueById(value.map(coerceGroup)) : []

export type GroupStore = ReturnType<typeof createGroupStore>

/**
 * The groups kept under `yt-client:groups` in `storage`, with every change, this tab's or another tab's (the
 * `storage` event on `events`), handed to subscribers. Without storage the groups live in memory only.
 */
export const createGroupStore = (storage?: Storage, events?: EventTarget) => {
  const read = () => {
    try {
      return coerceGroups(JSON.parse(storage?.getItem(GROUPS_KEY) ?? '[]'))
    } catch {
      return []
    }
  }

  let current = read()
  const listeners = new Set<(groups: Group[]) => void>()
  const publish = () => {
    for (const listener of listeners) listener(current)
  }

  const write = (next: Group[]) => {
    current = next
    try {
      storage?.setItem(GROUPS_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable (private mode, quota): the in-memory value still stands
    }
    publish()
  }

  events?.addEventListener('storage', (event) => {
    const key = (event as StorageEvent).key
    // a null key is the other tab clearing the whole storage
    if (key !== null && key !== GROUPS_KEY) return
    current = read()
    publish()
  })

  const update = (id: string, change: (group: Group) => Group) =>
    write(current.map(group => group.id === id ? coerceGroup(change(group)) ?? group : group))

  return {
    getGroups: () => current,
    subscribe: (listener: (groups: Group[]) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    createGroup: (fields: GroupFields) => {
      const group = coerceGroup({ id: crypto.randomUUID(), ...fields })
      if (!group) throw new Error('A group needs a name')
      write([...current, group])
      return group
    },
    updateGroup: (id: string, fields: Partial<GroupFields>) => update(id, group => ({ ...group, ...fields })),
    deleteGroup: (id: string) => write(current.filter(group => group.id !== id)),
    setChannel: (groupId: string, channel: GroupChannel, included: boolean) => update(groupId, group => ({
      ...group,
      channels: included
        ? [...group.channels.filter(kept => kept.id !== channel.id), channel]
        : group.channels.filter(kept => kept.id !== channel.id),
    })),
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

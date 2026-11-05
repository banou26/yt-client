import { describe, expect, it, vi } from 'vite-plus/test'

import { createGroupStore, DEFAULT_EMOJI, GROUPS_KEY, GROUPS_SYNC_KEY } from '../../../src/groups/store'

const ALPHA = { id: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'Alpha', avatar: 'https://yt3.ggpht.com/alpha' }
const BETA = { id: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: 'Beta' }

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    data,
    storage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value)
      },
      removeItem: (key: string) => {
        data.delete(key)
      },
      clear: () => data.clear(),
      key: (index: number) => [...data.keys()][index] ?? null,
      get length() {
        return data.size
      },
    } satisfies Storage,
  }
}

const storageEvent = (key: string | null) => Object.assign(new Event('storage'), { key })

describe('group store', () => {
  it('keeps what it writes, and a new store over the same storage reads it back', () => {
    const { storage } = memoryStorage()
    const store = createGroupStore(storage)
    const group = store.createGroup({ name: '  Tech  ', emoji: '💻', channels: [ALPHA] })
    store.setChannel(group.id, BETA, true)
    store.updateGroup(group.id, { name: 'Tech and science' })

    const expected = [{ id: group.id, name: 'Tech and science', emoji: '💻', channels: [ALPHA, BETA], updatedAt: expect.any(Number) }]
    expect(store.getGroups()).toEqual(expected)
    expect(createGroupStore(storage).getGroups()).toEqual(expected)

    store.setChannel(group.id, ALPHA, false)
    expect(store.getGroups()[0]?.channels).toEqual([BETA])
    store.deleteGroup(group.id)
    expect(createGroupStore(storage).getGroups()).toEqual([])
  })

  it('gives a new group its own id and a default icon', () => {
    const store = createGroupStore(memoryStorage().storage)
    const first = store.createGroup({ name: 'One' })
    const second = store.createGroup({ name: 'Two' })
    expect(first.id).not.toBe(second.id)
    expect(first.emoji).toBe(DEFAULT_EMOJI)
    expect(() => store.createGroup({ name: '   ' })).toThrow()
    expect(store.getGroups().map(group => group.name)).toEqual(['One', 'Two'])
  })

  it('reads storage that is not JSON as no groups', () => {
    const store = createGroupStore(memoryStorage({ [GROUPS_KEY]: '{not json' }).storage)
    expect(store.getGroups()).toEqual([])
  })

  it('drops each bad group or channel alone and keeps the rest', () => {
    const stored = [
      { id: 'kept', name: 'Kept', emoji: '🎵', channels: [
        ALPHA,
        { id: '@handle', name: 'Not a channel id' },
        { id: 'UCcccccccccccccccccccccc' },
        { ...BETA, avatar: 'javascript:alert(1)' },
        ALPHA,
        'nonsense',
      ] },
      { id: 'kept', name: 'Same id again' },
      { id: 'no-name', name: '' },
      { name: 'No id' },
      { id: 'no-channels', name: 'No channels', channels: 'many' },
      null,
      42,
    ]
    const store = createGroupStore(memoryStorage({ [GROUPS_KEY]: JSON.stringify(stored) }).storage)
    expect(store.getGroups()).toEqual([
      { id: 'kept', name: 'Kept', emoji: '🎵', channels: [ALPHA, BETA], updatedAt: 0 },
      { id: 'no-channels', name: 'No channels', emoji: DEFAULT_EMOJI, channels: [], updatedAt: 0 },
    ])
    expect(createGroupStore(memoryStorage({ [GROUPS_KEY]: '{"groups":[]}' }).storage).getGroups()).toEqual([])
  })

  it('tells subscribers about every change until they leave', () => {
    const store = createGroupStore(memoryStorage().storage)
    const seen: string[][] = []
    const leave = store.subscribe(groups => seen.push(groups.map(group => group.name)))
    const group = store.createGroup({ name: 'One' })
    store.updateGroup(group.id, { name: 'Uno' })
    leave()
    store.deleteGroup(group.id)
    expect(seen).toEqual([['One'], ['Uno']])
  })

  it('follows a change another tab made', () => {
    const { storage, data } = memoryStorage()
    const events = new EventTarget()
    const store = createGroupStore(storage, events)
    const seen: string[][] = []
    store.subscribe(groups => seen.push(groups.map(group => group.name)))

    data.set(GROUPS_KEY, JSON.stringify([{ id: 'other', name: 'From the other tab', channels: [BETA] }]))
    events.dispatchEvent(storageEvent('yt-client:settings'))
    expect(seen).toEqual([])
    events.dispatchEvent(storageEvent(GROUPS_KEY))
    expect(store.getGroups()).toEqual([{ id: 'other', name: 'From the other tab', emoji: DEFAULT_EMOJI, channels: [BETA], updatedAt: 0 }])

    data.clear()
    events.dispatchEvent(storageEvent(null))
    expect(seen).toEqual([['From the other tab'], []])
  })

  it('keeps working in memory when storage refuses a write, and says it no longer persists', () => {
    const { storage } = memoryStorage()
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    const store = createGroupStore(storage)
    expect(store.persists()).toBe(true)
    store.createGroup({ name: 'Unsaved' })
    expect(store.getGroups().map(group => group.name)).toEqual(['Unsaved'])
    expect(store.persists()).toBe(false)
    expect(createGroupStore().persists()).toBe(false)
  })

  it('stamps every edit later than the copy it replaces, even on a clock running behind', () => {
    vi.useFakeTimers({ now: 1_000 })
    try {
      const store = createGroupStore(memoryStorage().storage)
      const group = store.createGroup({ name: 'One' })
      expect(group.updatedAt).toBe(1_000)
      store.updateGroup(group.id, { name: 'Uno' })
      store.setChannel(group.id, ALPHA, true)
      expect(store.getGroups()[0]?.updatedAt).toBe(1_002)
      vi.setSystemTime(10)
      store.updateGroup(group.id, { emoji: '🎵' })
      expect(store.getGroups()[0]?.updatedAt).toBe(1_003)
    } finally {
      vi.useRealTimers()
    }
  })

  it('records when each group was deleted, and only edits tell the sync', () => {
    const { storage, data } = memoryStorage()
    const store = createGroupStore(storage)
    let edits = 0
    store.onEdit(() => {
      edits += 1
    })
    const group = store.createGroup({ name: 'Gone' })
    store.deleteGroup(group.id)
    store.deleteGroup('not-a-group')
    expect(edits).toBe(2)
    expect(Object.keys(JSON.parse(data.get(GROUPS_SYNC_KEY) ?? '{}').deleted)).toEqual([group.id])
    expect(store.snapshot().deleted[group.id]).toBeGreaterThan(group.updatedAt)

    store.settle([], { file: 'account-file', deleted: {} })
    expect(edits).toBe(2)
    expect(createGroupStore(storage).snapshot()).toEqual({ groups: [], file: 'account-file', deleted: {} })
  })
})

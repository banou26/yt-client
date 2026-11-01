import { describe, expect, it } from 'vite-plus/test'

import { createGroupStore, DEFAULT_EMOJI, GROUPS_KEY } from '../../../src/groups/store'

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

    const expected = [{ id: group.id, name: 'Tech and science', emoji: '💻', channels: [ALPHA, BETA] }]
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
      { id: 'kept', name: 'Kept', emoji: '🎵', channels: [ALPHA, BETA] },
      { id: 'no-channels', name: 'No channels', emoji: DEFAULT_EMOJI, channels: [] },
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
    expect(store.getGroups()).toEqual([{ id: 'other', name: 'From the other tab', emoji: DEFAULT_EMOJI, channels: [BETA] }])

    data.clear()
    events.dispatchEvent(storageEvent(null))
    expect(seen).toEqual([['From the other tab'], []])
  })

  it('keeps working in memory when storage refuses a write', () => {
    const { storage } = memoryStorage()
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    const store = createGroupStore(storage)
    store.createGroup({ name: 'Unsaved' })
    expect(store.getGroups().map(group => group.name)).toEqual(['Unsaved'])
  })
})

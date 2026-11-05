import { E2E_INTEGRITY_MESSAGE, E2E_RETIRED_FORMAT_MESSAGE, E2E_STALE_EPOCH_MESSAGE } from '@fkn/lib/messages'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { createGroupStore, GROUPS_SYNC_KEY } from '../../../src/groups/store'
import { GROUPS_PATH, groupSync, mergeGroups, type GroupsCloud } from '../../../src/groups/sync'

const BETA = { id: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: 'Beta' }

const memoryStorage = () => {
  const data = new Map<string, string>()
  const storage: Storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size
    },
  }
  return { data, storage }
}

const group = (id: string, updatedAt: number, name = id) => ({ id, name, emoji: '📁', channels: [], updatedAt })

type Call = keyof GroupsCloud

/**
 * FKN as the sync meets it: accounts whose files are kept apart, and browsers each signed in to at most one. A call
 * takes its account when it is made, as @fkn/lib pins it. A sealed call with no key raises FKN's card.
 */
const fknWorld = () => {
  const files = new Map<string, string>()
  // the error an account's file reads with: an encryption reset, a damaged file
  const failing = new Map<string, string>()
  const never = new Promise<never>(() => {})

  const browser = (account?: string, { unlocked = true, storage = memoryStorage() as ReturnType<typeof memoryStorage> | null } = {}) => {
    const state = {
      account,
      unlocked,
      cards: 0,
      calls: { availability: 0, unlocked: 0, read: 0, write: 0 } satisfies Record<Call, number>,
      hang: new Set<Call>(),
      writeGate: undefined as Promise<void> | undefined,
      // FKN drops a key from before a reset when a read finds the file sealed under an older one
      dropsKeyOnReset: false,
      listeners: new Set<(change?: { switched: boolean }) => void>(),
    }
    const sealed = (call: Call) => {
      state.calls[call] += 1
      if (!state.account) throw new Error('storage: not connected')
      if (!state.unlocked) {
        state.cards += 1
        throw new Error('a sealed call raised the connect card')
      }
      return state.account
    }
    const cloud: GroupsCloud = {
      availability: async () => {
        state.calls.availability += 1
        if (state.hang.has('availability')) return never
        return state.account ? 'connected' : 'disconnected'
      },
      unlocked: async () => {
        state.calls.unlocked += 1
        if (state.hang.has('unlocked')) return never
        return state.unlocked
      },
      read: async (path) => {
        const account = sealed('read')
        if (state.hang.has('read')) return never
        const failure = failing.get(account)
        if (failure) {
          if (state.dropsKeyOnReset && failure === E2E_STALE_EPOCH_MESSAGE) state.unlocked = false
          throw new Error(failure)
        }
        return files.get(`${account}:${path}`) ?? null
      },
      write: async (path, text) => {
        const account = sealed('write')
        if (state.hang.has('write')) return never
        await state.writeGate
        files.set(`${account}:${path}`, text)
        failing.delete(account)
      },
    }
    let tail = Promise.resolve()
    const open = ({ boundMs }: { boundMs?: number } = {}) => {
      const store = createGroupStore(storage?.storage)
      const sync = groupSync({
        store,
        cloud,
        onAccountChange: listener => state.listeners.add(listener),
        lock: work => (tail = tail.then(work, work)),
        boundMs,
      })
      return { store, sync }
    }
    const signIn = (next?: string) => {
      const switched = next !== state.account
      state.account = next
      for (const listener of state.listeners) listener({ switched })
    }
    const total = () => Object.values(state.calls).reduce((sum, count) => sum + count, 0)
    // runs `effect` once, when `call` next answers and before the step sees the answer
    const after = (call: 'availability' | 'unlocked' | 'read', effect: () => void) => {
      const original: (path: string) => Promise<unknown> = cloud[call]
      Object.assign(cloud, {
        [call]: async (path: string) => {
          const answer = await original(path)
          Object.assign(cloud, { [call]: original })
          effect()
          return answer
        },
      })
    }
    return { state, cloud, data: storage?.data, open, signIn, total, after }
  }

  const fileOf = (account: string) => {
    const text = files.get(`${account}:${GROUPS_PATH}`)
    return text ? JSON.parse(text) as { file: string, groups: { id: string, name: string }[], deleted: Record<string, number> } : undefined
  }
  const namesOf = (account: string) => fileOf(account)?.groups.map(kept => kept.name)
  return { browser, files, failing, fileOf, namesOf }
}

const names = (store: { getGroups: () => { name: string }[] }) => store.getGroups().map(kept => kept.name)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('mergeGroups', () => {
  it('keeps the later copy of each group, the account\'s on a tie', () => {
    const merged = mergeGroups(
      { groups: [group('a', 5, 'a theirs'), group('b', 5, 'b theirs'), group('c', 7, 'c theirs')], deleted: {} },
      { groups: [group('a', 6, 'a ours'), group('b', 5, 'b ours'), group('c', 6, 'c ours')], deleted: {} },
    )
    expect(merged.groups.map(kept => kept.name)).toEqual(['a ours', 'b theirs', 'c theirs'])
  })

  it('drops a group deleted after its last edit, keeps one edited after its deletion, and keeps the later deletion', () => {
    const merged = mergeGroups(
      { groups: [group('a', 5), group('b', 9)], deleted: { a: 7, c: 2 } },
      { groups: [group('a', 5)], deleted: { a: 3, b: 8, c: 4 } },
    )
    expect(merged.groups.map(kept => kept.id)).toEqual(['b'])
    expect(merged.deleted).toEqual({ a: 7, c: 4, b: 8 })
  })

  it('keeps the account\'s order and puts groups only this browser holds after it', () => {
    const merged = mergeGroups(
      { groups: [group('b', 1), group('a', 1)], deleted: {} },
      { groups: [group('c', 1), group('a', 2)], deleted: {} },
    )
    expect(merged.groups.map(kept => kept.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('groupSync', () => {
  it('works signed out of FKN without reading or writing anything, and keeps no record of a deletion', async () => {
    const world = fknWorld()
    const device = world.browser()
    const { store, sync } = device.open()
    store.createGroup({ name: 'Music' })
    store.deleteGroup(store.createGroup({ name: 'Old' }).id)
    await sync.check()
    expect(names(store)).toEqual(['Music'])
    expect(device.state.calls.read + device.state.calls.write).toBe(0)
    expect(device.data?.get(GROUPS_SYNC_KEY)).toBe('{"deleted":{}}')
  })

  it('merges each browser\'s own groups into the account at its first sign-in, and both then show all of them', async () => {
    const world = fknWorld()
    const laptop = world.browser()
    const phone = world.browser()
    const onLaptop = laptop.open()
    const onPhone = phone.open()
    onLaptop.store.createGroup({ name: 'Music' })
    onPhone.store.createGroup({ name: 'News' })

    laptop.signIn('ann')
    await onLaptop.sync.check()
    expect(world.namesOf('ann')).toEqual(['Music'])

    phone.signIn('ann')
    await onPhone.sync.check()
    expect(names(onPhone.store)).toEqual(['Music', 'News'])
    await onLaptop.sync.check()
    expect(names(onLaptop.store)).toEqual(['Music', 'News'])
  })

  it('keeps both lists when two browsers each create the account\'s file at once', async () => {
    const world = fknWorld()
    const laptop = world.browser()
    const phone = world.browser()
    const onLaptop = laptop.open()
    const onPhone = phone.open()
    onLaptop.store.createGroup({ name: 'Music' })
    onPhone.store.createGroup({ name: 'News' })
    await onLaptop.sync.check()
    await onPhone.sync.check()

    // both find no file and each writes one under its own id, the phone's last
    let releaseLaptop!: () => void
    let releasePhone!: () => void
    laptop.state.writeGate = new Promise(resolve => releaseLaptop = resolve)
    phone.state.writeGate = new Promise(resolve => releasePhone = resolve)
    laptop.signIn('ann')
    phone.signIn('ann')
    await vi.waitFor(() => expect(laptop.state.calls.write + phone.state.calls.write).toBe(2))
    releaseLaptop()
    await vi.waitFor(() => expect(world.namesOf('ann')).toEqual(['Music']))
    releasePhone()
    await vi.waitFor(() => expect(world.namesOf('ann')).toEqual(['News']))

    await onLaptop.sync.check()
    await onPhone.sync.check()
    expect(world.namesOf('ann')).toEqual(['News', 'Music'])
    expect(names(onLaptop.store)).toEqual(['News', 'Music'])
    expect(names(onPhone.store)).toEqual(['News', 'Music'])
  })

  it('carries an edit and a deletion from one browser to the other', async () => {
    const world = fknWorld()
    const laptop = world.browser('ann')
    const phone = world.browser('ann')
    const onLaptop = laptop.open()
    const onPhone = phone.open()
    const music = onLaptop.store.createGroup({ name: 'Music' })
    onLaptop.store.createGroup({ name: 'News' })
    await onLaptop.sync.check()
    await onPhone.sync.check()

    onPhone.store.setChannel(music.id, BETA, true)
    await onPhone.sync.check()
    await onLaptop.sync.check()
    expect(onLaptop.store.getGroups()[0]?.channels).toEqual([BETA])

    onLaptop.store.deleteGroup(music.id)
    await onLaptop.sync.check()
    await onPhone.sync.check()
    expect(names(onPhone.store)).toEqual(['News'])
  })

  it('keeps a deletion when another browser writes a copy it read before the deletion landed', async () => {
    const world = fknWorld()
    const laptop = world.browser('ann')
    const phone = world.browser('ann')
    const onLaptop = laptop.open()
    const onPhone = phone.open()
    const doomed = onLaptop.store.createGroup({ name: 'Doomed' })
    onLaptop.store.createGroup({ name: 'Kept' })
    await onLaptop.sync.check()
    await onPhone.sync.check()

    // both read the same file, then the laptop's write lands and the phone's stale one lands after it
    let releaseLaptop!: () => void
    let releasePhone!: () => void
    laptop.state.writeGate = new Promise(resolve => releaseLaptop = resolve)
    phone.state.writeGate = new Promise(resolve => releasePhone = resolve)
    onLaptop.store.deleteGroup(doomed.id)
    onPhone.store.updateGroup(onPhone.store.getGroups()[1]!.id, { name: 'Kept renamed' })
    await vi.waitFor(() => expect(laptop.state.calls.write + phone.state.calls.write).toBe(3))
    laptop.state.writeGate = phone.state.writeGate = undefined
    releaseLaptop()
    await onLaptop.sync.check()
    releasePhone()
    await onPhone.sync.check()
    expect(world.namesOf('ann')).toEqual(['Doomed', 'Kept renamed'])

    await onLaptop.sync.check()
    await onPhone.sync.check()
    expect(world.namesOf('ann')).toEqual(['Kept renamed'])
    expect(names(onLaptop.store)).toEqual(['Kept renamed'])
    expect(names(onPhone.store)).toEqual(['Kept renamed'])
  })

  it('never merges one account\'s groups into another, even when the switch happened while the page was closed', async () => {
    const world = fknWorld()
    const device = world.browser('ann')
    const first = device.open()
    first.store.createGroup({ name: 'Ann\'s' })
    await first.sync.check()
    // the second step reads the file back, which makes the list the account's
    await first.sync.check()

    // fkn.app signed out and in as another account while yt-client was closed: no change was heard
    device.state.account = 'bob'
    const again = device.open()
    await again.sync.check()
    expect(names(again.store)).toEqual([])
    expect(world.fileOf('bob')).toBeUndefined()

    again.store.createGroup({ name: 'Bob\'s' })
    await again.sync.check()
    expect(world.namesOf('bob')).toEqual(['Bob\'s'])
    expect(world.namesOf('ann')).toEqual(['Ann\'s'])
  })

  it('writes nothing once an account change was heard during the step', async () => {
    const world = fknWorld()
    const device = world.browser('ann')
    const { store, sync } = device.open()
    store.createGroup({ name: 'Music' })
    await sync.check()
    await sync.check()
    const read = device.cloud.read
    device.cloud.read = async (path) => {
      const text = await read(path)
      device.cloud.read = read
      device.signIn('bob')
      return text
    }
    store.createGroup({ name: 'News' })
    await sync.check()
    await sync.check()
    expect(world.fileOf('bob')).toBeUndefined()
    expect(world.namesOf('ann')).toEqual(['Music'])
    expect(names(store)).toEqual([])
  })

  it('takes nothing out of the browser when a sign-in is heard while FKN answers signed out', async () => {
    const world = fknWorld()
    const device = world.browser('ann')
    const { store, sync } = device.open()
    const music = store.createGroup({ name: 'Music' })
    await sync.check()
    await sync.check()

    // fkn.app signed out without a word to this page, and signing back in is heard while FKN answers the step
    device.state.account = undefined
    device.after('availability', () => device.signIn('ann'))
    store.updateGroup(music.id, { name: 'Music 2' })
    await vi.waitFor(() => expect(world.namesOf('ann')).toEqual(['Music 2']))
    expect(names(store)).toEqual(['Music 2'])
  })

  it('reads nothing and raises no card once a switch is heard while it asks for the key', async () => {
    const world = fknWorld()
    const device = world.browser('ann')
    const { store, sync } = device.open()
    store.createGroup({ name: 'Music' })
    await sync.check()
    const reads = device.state.calls.read

    // this browser holds no key for bob's account
    device.after('unlocked', () => {
      device.signIn('bob')
      device.state.unlocked = false
    })
    store.createGroup({ name: 'News' })
    await sync.check()
    await sync.check()
    expect(device.state.cards).toBe(0)
    expect(device.state.calls.read).toBe(reads)
  })

  it('brings nothing in from the old account once a switch is heard during the read', async () => {
    const world = fknWorld()
    const laptop = world.browser('ann')
    const phone = world.browser('ann')
    const onLaptop = laptop.open({ boundMs: 20 })
    const onPhone = phone.open()
    onLaptop.store.createGroup({ name: 'Music' })
    await onLaptop.sync.check()
    onPhone.store.createGroup({ name: 'News' })
    await onPhone.sync.check()

    // FKN stops answering after the switch, so no later step puts the list right
    laptop.after('read', () => {
      laptop.signIn('bob')
      laptop.state.hang.add('availability')
    })
    await onLaptop.sync.check()
    await onLaptop.sync.check()
    expect(names(onLaptop.store)).toEqual(['Music'])
  })

  it('finishes a step during which only the account\'s connection was renewed', async () => {
    const world = fknWorld()
    const device = world.browser('ann')
    const { store, sync } = device.open({ boundMs: 20 })
    store.createGroup({ name: 'Music' })
    await sync.check()

    // FKN stops answering after the renewal, so only this step can carry the new group
    device.after('read', () => {
      device.signIn('ann')
      device.state.hang.add('availability')
    })
    store.createGroup({ name: 'News' })
    await sync.check()
    await sync.check()
    expect(world.namesOf('ann')).toEqual(['Music', 'News'])
  })

  it('never reads or writes while this browser holds no key', async () => {
    const world = fknWorld()
    const device = world.browser('ann', { unlocked: false })
    const { store, sync } = device.open()
    store.createGroup({ name: 'Music' })
    await sync.check()
    expect(device.state.calls.unlocked).toBe(1)
    expect(device.state.cards + device.state.calls.read + device.state.calls.write).toBe(0)
    expect(names(store)).toEqual(['Music'])
  })

  it('reads an FKN that does not answer as could not tell: the account\'s groups stay and nothing lands', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const world = fknWorld()
    const device = world.browser('ann')
    const { store, sync } = device.open({ boundMs: 20 })
    store.createGroup({ name: 'Music' })
    await sync.check()
    await sync.check()
    const file = world.fileOf('ann')?.file

    device.state.hang.add('availability')
    await sync.check()
    expect(names(store)).toEqual(['Music'])
    expect(store.snapshot().file).toBe(file)
    device.state.hang.clear()

    device.state.hang.add('unlocked')
    store.createGroup({ name: 'News' })
    await sync.check()
    expect(device.state.calls.read).toBe(2)
    device.state.hang.clear()

    for (const call of ['read', 'write'] as const) {
      device.state.hang.add(call)
      await sync.check()
      expect(world.namesOf('ann')).toEqual(['Music'])
      device.state.hang.clear()
    }

    await sync.check()
    expect(world.namesOf('ann')).toEqual(['Music', 'News'])
  })

  it('takes the account\'s groups out of the browser at an FKN sign out, and leaves them on the account', async () => {
    const world = fknWorld()
    const device = world.browser('ann')
    const { store, sync } = device.open()
    store.createGroup({ name: 'Music' })
    store.deleteGroup(store.createGroup({ name: 'Old' }).id)
    await sync.check()
    await sync.check()
    device.signIn(undefined)
    await sync.check()
    expect(names(store)).toEqual([])
    expect(device.data?.get(GROUPS_SYNC_KEY)).toBe('{"deleted":{}}')
    expect(world.namesOf('ann')).toEqual(['Music'])

    device.signIn('ann')
    await sync.check()
    expect(names(store)).toEqual(['Music'])
  })

  it('starts the account\'s copy again under a new id after an encryption reset, never merging a list it cannot prove is this account\'s', async () => {
    const world = fknWorld()
    const laptop = world.browser('ann')
    const phone = world.browser()
    const onLaptop = laptop.open()
    const onPhone = phone.open()
    onLaptop.store.createGroup({ name: 'Music' })
    await onLaptop.sync.check()
    await onLaptop.sync.check()
    const before = world.fileOf('ann')?.file
    onPhone.store.createGroup({ name: 'News' })

    world.failing.set('ann', E2E_STALE_EPOCH_MESSAGE)
    phone.signIn('ann')
    await onPhone.sync.check()
    expect(world.namesOf('ann')).toEqual(['News'])
    expect(world.fileOf('ann')?.file).not.toBe(before)

    await onLaptop.sync.check()
    expect(names(onLaptop.store)).toEqual(['News'])

    world.failing.set('ann', E2E_RETIRED_FORMAT_MESSAGE)
    await onLaptop.sync.check()
    expect(world.namesOf('ann')).toEqual([])
    expect(names(onLaptop.store)).toEqual([])
  })

  it('writes nothing and raises no card when the reset also dropped this browser\'s key', async () => {
    const world = fknWorld()
    const device = world.browser('ann')
    device.state.dropsKeyOnReset = true
    const { store, sync } = device.open()
    store.createGroup({ name: 'Music' })
    world.failing.set('ann', E2E_STALE_EPOCH_MESSAGE)
    await sync.check()
    expect(device.state.cards + device.state.calls.write).toBe(0)
    expect(names(store)).toEqual(['Music'])
  })

  it('never writes over a file that failed its integrity check or that it cannot read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const world = fknWorld()
    const device = world.browser('ann')
    const { store, sync } = device.open()
    store.createGroup({ name: 'Music' })
    for (const text of ['{"v":9}', 'not json']) {
      world.files.set(`ann:${GROUPS_PATH}`, text)
      await sync.check()
      expect(world.files.get(`ann:${GROUPS_PATH}`)).toBe(text)
    }
    world.failing.set('ann', E2E_INTEGRITY_MESSAGE)
    await sync.check()
    expect(device.state.calls.write).toBe(0)
    expect(names(store)).toEqual(['Music'])
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('does not start without storage, or once storage refused a write, so no edit is undone', async () => {
    const world = fknWorld()
    const seed = world.browser('ann').open()
    seed.store.createGroup({ name: 'On account' })
    await seed.sync.check()

    const refusing = memoryStorage()
    refusing.storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    for (const storage of [null, refusing]) {
      const device = world.browser('ann', { storage })
      const { store, sync } = device.open()
      store.createGroup({ name: 'Made here' })
      await sync.check()
      expect(names(store)).toEqual(['Made here'])
      expect(device.total()).toBe(0)
    }
    expect(world.namesOf('ann')).toEqual(['On account'])
  })

  it('keeps an edit whose write storage refused while a step was in flight', async () => {
    const world = fknWorld()
    const storage = memoryStorage()
    const device = world.browser('ann', { storage })
    const { store, sync } = device.open()
    store.createGroup({ name: 'Music' })
    await sync.check()
    const read = device.cloud.read
    device.cloud.read = async (path) => {
      const text = await read(path)
      device.cloud.read = read
      storage.storage.setItem = () => {
        throw new Error('QuotaExceededError')
      }
      store.createGroup({ name: 'News' })
      return text
    }
    await sync.check()
    await sync.check()
    expect(names(store)).toEqual(['Music', 'News'])
  })

  it('keeps an edit made while a step was in flight', async () => {
    const world = fknWorld()
    const device = world.browser('ann')
    const { store, sync } = device.open()
    store.createGroup({ name: 'Music' })
    const read = device.cloud.read
    device.cloud.read = async (path) => {
      const text = await read(path)
      device.cloud.read = read
      store.createGroup({ name: 'News' })
      return text
    }
    await sync.check()
    await vi.waitFor(() => expect(world.namesOf('ann')).toEqual(['Music', 'News']))
    expect(names(store)).toEqual(['Music', 'News'])
  })

  it('never quotes the account file in what it logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const world = fknWorld()
    const device = world.browser('ann')
    world.files.set(`ann:${GROUPS_PATH}`, 'My private group')
    const { sync } = device.open()
    await sync.check()
    expect(warn).toHaveBeenCalled()
    const logged = warn.mock.calls.map(call => call.map(part => part instanceof Error ? part.message : part))
    expect(JSON.stringify(logged)).not.toContain('private')
  })
})

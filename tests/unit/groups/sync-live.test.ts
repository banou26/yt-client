import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

const onChange = vi.fn(async () => () => {})

vi.mock('../../../src/scramjet/platform', () => ({ startPlatform: async () => ({}) }))
vi.mock('@fkn/lib/account', () => ({ onChange }))
vi.mock('@fkn/lib/cloud/fs', () => ({ availability: async () => 'disconnected' }))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('fknStatus', () => {
  const fs = (availability: 'connected' | 'disconnected' | 'unknown', { unlocked = true, enrolled = true } = {}) =>
    ({ availability: async () => availability, encryption: async () => ({ unlocked, enrolled, keyEpoch: null }) })

  it('reads signed in or out only from an answer, so a failing FKN shows no FKN row', async () => {
    const { fknStatus } = await import('../../../src/groups/sync-live')
    expect(await fknStatus(fs('unknown'))).toBeUndefined()
    expect(await fknStatus(fs('disconnected'))).toEqual({ signedIn: false, locked: false })
    expect(await fknStatus(fs('connected'))).toEqual({ signedIn: true, locked: false })
    expect(await fknStatus(fs('connected', { unlocked: false, enrolled: true }))).toEqual({ signedIn: true, locked: true })
    expect(await fknStatus(fs('connected', { unlocked: false, enrolled: false }))).toEqual({ signedIn: true, locked: false })
  })
})

describe('startGroupSync', () => {
  it('starts only where navigator.locks exists', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {} })
    vi.stubGlobal('window', { addEventListener: () => {} })

    vi.stubGlobal('navigator', {})
    const unlocked = await import('../../../src/groups/sync-live')
    await expect(unlocked.startGroupSync()).rejects.toThrow('navigator.locks')
    expect(onChange).not.toHaveBeenCalled()

    // the control: the same start in a page that has the lock
    vi.resetModules()
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, work: () => Promise<void>) => work() } })
    const locked = await import('../../../src/groups/sync-live')
    await locked.startGroupSync()
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

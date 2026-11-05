import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

const onChange = vi.fn(async () => () => {})

vi.mock('../../../src/scramjet/platform', () => ({ startPlatform: async () => ({}) }))
vi.mock('@fkn/lib/account', () => ({ onChange }))
vi.mock('@fkn/lib/cloud/fs', () => ({ availability: async () => 'disconnected' }))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
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

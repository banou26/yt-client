import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

const load = async (stored?: unknown) => {
  vi.resetModules()
  vi.stubGlobal('localStorage', {
    getItem: () => (stored === undefined ? null : JSON.stringify(stored)),
    setItem: () => {},
  })
  return import('../../src/settings')
}

describe('the theme setting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('follows the device until a theme is chosen', async () => {
    const { getSettings } = await load()
    expect(getSettings().theme).toBe('device')
  })

  it('keeps a theme chosen in Settings', async () => {
    expect((await load({ theme: 'dark' })).getSettings().theme).toBe('dark')
    expect((await load({ theme: 'light' })).getSettings().theme).toBe('light')
  })

  it('follows the device when the stored value is not a theme', async () => {
    expect((await load({ theme: 'sepia' })).getSettings().theme).toBe('device')
  })
})

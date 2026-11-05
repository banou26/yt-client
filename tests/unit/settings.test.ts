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
    expect((await load({ theme: 'dark', themeChosen: true })).getSettings().theme).toBe('dark')
    expect((await load({ theme: 'light' })).getSettings().theme).toBe('light')
  })

  it('reads a Dark saved without being chosen as the device theme', async () => {
    expect((await load({ theme: 'dark', extensionSeen: true })).getSettings().theme).toBe('device')
  })

  it('marks a theme as chosen when one is picked, so Dark sticks', async () => {
    const written: string[] = []
    vi.resetModules()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: (_key: string, value: string) => written.push(value) })
    const { updateSettings } = await import('../../src/settings')
    updateSettings({ theme: 'dark' })
    const saved = JSON.parse(written.at(-1)!)
    expect(saved).toMatchObject({ theme: 'dark', themeChosen: true })
    expect((await load(saved)).getSettings().theme).toBe('dark')
  })

  it('leaves the mark alone when something other than the theme changes', async () => {
    const written: string[] = []
    vi.resetModules()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: (_key: string, value: string) => written.push(value) })
    const { updateSettings } = await import('../../src/settings')
    updateSettings({ volume: 0.5 })
    expect(JSON.parse(written.at(-1)!).themeChosen).toBeUndefined()
  })

  it('follows the device when the stored value is not a theme', async () => {
    expect((await load({ theme: 'sepia' })).getSettings().theme).toBe('device')
  })
})

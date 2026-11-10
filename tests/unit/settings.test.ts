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

describe('the dislike counts setting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is on until turned off', async () => {
    expect((await load()).getSettings().showDislikes).toBe(true)
    expect((await load({ theater: true })).getSettings().showDislikes).toBe(true)
    expect((await load({ showDislikes: false })).getSettings().showDislikes).toBe(false)
  })

  it('is on when the stored value is not a boolean', async () => {
    expect((await load({ showDislikes: 'no' })).getSettings().showDislikes).toBe(true)
    expect((await load({ showDislikes: 0 })).getSettings().showDislikes).toBe(true)
  })
})

describe('the Skip sponsors setting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is on until turned off', async () => {
    expect((await load()).getSettings().skipSponsors).toBe(true)
    expect((await load({ skipSponsors: 'no' })).getSettings().skipSponsors).toBe(true)
    expect((await load({ skipSponsors: false })).getSettings().skipSponsors).toBe(false)
  })
})

describe('the caption size setting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is the default size until + or - picks one of their steps', async () => {
    expect((await load()).getSettings().captionSize).toBe(100)
    expect((await load({ captionSize: 150 })).getSettings().captionSize).toBe(150)
    expect((await load({ captionSize: 50 })).getSettings().captionSize).toBe(50)
  })

  it('keeps a size the Options panel picks between the steps of + and -', async () => {
    expect((await load({ captionSize: 75 })).getSettings().captionSize).toBe(75)
    expect((await load({ captionSize: 175 })).getSettings().captionSize).toBe(175)
  })

  it('is the default size when the stored value is not one of the sizes', async () => {
    expect((await load({ captionSize: 60 })).getSettings().captionSize).toBe(100)
    expect((await load({ captionSize: 400 })).getSettings().captionSize).toBe(100)
    expect((await load({ captionSize: '150' })).getSettings().captionSize).toBe(100)
  })
})

describe('the speed setting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps every speed the fixed list stored before the slider', async () => {
    for (const rate of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
      expect((await load({ playbackRate: rate })).getSettings().playbackRate).toBe(rate)
    }
  })

  it('reads a speed off the slider\'s range or steps as the nearest one on it', async () => {
    expect((await load({ playbackRate: 1.1 })).getSettings().playbackRate).toBe(1.1)
    expect((await load({ playbackRate: 1.1 + 0.05 })).getSettings().playbackRate).toBe(1.15)
    expect((await load({ playbackRate: 3 })).getSettings().playbackRate).toBe(2)
    expect((await load({ playbackRate: 0.1 })).getSettings().playbackRate).toBe(0.25)
    expect((await load({ playbackRate: '1.5' })).getSettings().playbackRate).toBe(1)
  })
})

describe('the caption look settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('start at youtube.com\'s defaults', async () => {
    expect((await load()).getSettings()).toMatchObject({
      captionFont: 'Proportional Sans-Serif',
      captionColor: 'White',
      captionSize: 100,
      captionBackground: 'Black',
      captionBackgroundOpacity: 0.75,
      captionEdge: 'None',
      captionOpacity: 1,
    })
  })

  it('keep what the Options panel picked for the next visit', async () => {
    const written: string[] = []
    vi.resetModules()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: (_key: string, value: string) => written.push(value) })
    const { updateSettings } = await import('../../src/settings')
    updateSettings({ captionColor: 'Yellow', captionBackgroundOpacity: 0.25, captionEdge: 'Outline', captionFont: 'Casual', captionOpacity: 0.5 })
    expect((await load(JSON.parse(written.at(-1)!))).getSettings()).toMatchObject({
      captionColor: 'Yellow',
      captionBackgroundOpacity: 0.25,
      captionEdge: 'Outline',
      captionFont: 'Casual',
      captionOpacity: 0.5,
    })
  })

  it('fall back one at a time when a stored value is not a choice', async () => {
    expect((await load({ captionColor: 'Orange', captionBackground: 'Blue', captionOpacity: 0.3, captionEdge: 'Raised' })).getSettings()).toMatchObject({
      captionColor: 'White',
      captionBackground: 'Blue',
      captionOpacity: 1,
      captionEdge: 'Raised',
    })
  })
})

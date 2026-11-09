import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { stepEnabled } from '../../../src/engine/step-flag'

const storage = (values: Record<string, string>) => {
  vi.stubGlobal('localStorage', { getItem: (key: string) => values[key] ?? null })
}

describe('the migration step flags', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the direct lane on unless the flag is 0', () => {
    storage({})
    expect(stepEnabled('direct')).toBe(true)
    storage({ 'yt-client:step:direct': '1' })
    expect(stepEnabled('direct')).toBe(true)
    storage({ 'yt-client:step:direct': 'false' })
    expect(stepEnabled('direct')).toBe(true)
    storage({ 'yt-client:step:direct': '0' })
    expect(stepEnabled('direct')).toBe(false)
  })

  it('keeps y1 on unless the flag is 0 (control)', () => {
    storage({})
    expect(stepEnabled('y1')).toBe(true)
    storage({ 'yt-client:step:y1': '0' })
    expect(stepEnabled('y1')).toBe(false)
  })

  it('leaves each step on when storage cannot be read', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new DOMException('denied', 'SecurityError') } })
    expect(stepEnabled('direct')).toBe(true)
    expect(stepEnabled('y1')).toBe(true)
  })
})

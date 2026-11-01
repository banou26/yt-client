import { describe, expect, it } from 'vite-plus/test'

import { stepRate } from '../../../src/player/rates'

describe('the < and > speed keys', () => {
  it('step through the offered speeds and hold at either end', () => {
    expect(stepRate(1, 1)).toBe(1.25)
    expect(stepRate(1.25, -1)).toBe(1)
    expect(stepRate(2, 1)).toBe(2)
    expect(stepRate(0.25, -1)).toBe(0.25)
  })

  it('move from a speed the menu does not offer to the nearest one in that direction', () => {
    expect(stepRate(1.1, 1)).toBe(1.25)
    expect(stepRate(1.1, -1)).toBe(1)
  })
})

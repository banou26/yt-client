import { describe, expect, it } from 'vite-plus/test'

import { holdsSession } from '../../../src/scramjet/jar'

const NOW = 1_800_000_000_000

describe('the session in the Scramjet jar', () => {
  it('is a live SAPISID on youtube.com', () => {
    expect(holdsSession([{ name: 'SAPISID', domain: '.youtube.com', expires: NOW + 1_000 }], NOW)).toBe(true)
    expect(holdsSession([{ name: 'SAPISID', domain: '.youtube.com' }], NOW)).toBe(true)
  })

  it("is not Google's own, an expired one, or a cookie of a similar name", () => {
    expect(holdsSession([], NOW)).toBe(false)
    expect(holdsSession([{ name: 'SAPISID', domain: '.google.com', expires: NOW + 1_000 }], NOW)).toBe(false)
    expect(holdsSession([{ name: 'SAPISID', domain: '.youtube.com', expires: NOW - 1 }], NOW)).toBe(false)
    expect(holdsSession([{ name: '__Secure-3PAPISID', domain: '.youtube.com' }, { name: '__Host-GAPS', domain: '.accounts.google.com' }], NOW)).toBe(false)
  })
})

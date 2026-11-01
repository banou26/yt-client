import { describe, expect, it } from 'vite-plus/test'

import { withPage } from '../../../src/routes/feed-pages'

describe('loaded feed pages', () => {
  it('adds the page just read after the ones already loaded', () => {
    expect(withPage(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
  })

  it('keeps the loaded pages when a continuation failed', () => {
    expect(withPage(['a', 'b'], undefined)).toEqual(['a', 'b'])
  })
})

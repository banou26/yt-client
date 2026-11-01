import { describe, expect, it } from 'vite-plus/test'

import { splitSuggestion } from '../../../src/components/suggestion'

describe('splitSuggestion', () => {
  it('keeps the typed prefix plain and bolds the rest', () => {
    expect(splitSuggestion('rick a', 'rick astley')).toEqual({ typed: 'rick a', completion: 'stley' })
  })

  it('matches the prefix without regard to case and keeps the suggestion\'s own casing', () => {
    expect(splitSuggestion('Rick', 'rick roll')).toEqual({ typed: 'rick', completion: ' roll' })
  })

  it('ignores leading spaces in what was typed', () => {
    expect(splitSuggestion('  lofi', 'lofi hip hop')).toEqual({ typed: 'lofi', completion: ' hip hop' })
  })

  it('bolds a suggestion that does not start with the typed text in full', () => {
    expect(splitSuggestion('lofi', 'chill lofi')).toEqual({ typed: '', completion: 'chill lofi' })
    expect(splitSuggestion('', 'lofi')).toEqual({ typed: '', completion: 'lofi' })
  })
})

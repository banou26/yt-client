import { describe, expect, it } from 'vite-plus/test'

import { lazyCode } from '../../src/lazy-code'

const chunk = (imports: string[], dynamicImports: string[] = []) => ({ type: 'chunk' as const, imports, dynamicImports })

describe('lazyCode', () => {
  it('lists every file reachable only through a dynamic import, with the dynamic files\' own imports', () => {
    const bundle = {
      'assets/app.js': chunk(['assets/vendor.js'], ['assets/search.js']),
      'assets/vendor.js': chunk([]),
      'assets/search.js': chunk(['assets/vendor.js', 'assets/card.js'], ['assets/player.js']),
      'assets/card.js': chunk([]),
      'assets/player.js': chunk(['assets/vendor.js']),
      'assets/app.css': { type: 'asset' as const },
      'assets/unused.js': chunk([]),
    }
    expect(lazyCode(bundle, 'assets/app.js').sort()).toEqual(['/assets/card.js', '/assets/player.js', '/assets/search.js'])
  })
})

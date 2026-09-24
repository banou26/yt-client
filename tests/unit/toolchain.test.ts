import { describe, expect, it } from 'vite-plus/test'

// Imported as JSON rather than read with node:fs, which vite.config.ts aliases to an empty browser shim
// through vite-plugin-node-polyfills, and that config is what vp test runs under.
import manifest from '../../package.json'
import lock from '../../package-lock.json'

// vite-plus bundles its own vitest and ships vite as vite-plus-core, and its docs require a project to
// pin both to the same release ("Updating the Vitest Pin" at viteplus.dev). A pin left behind on a
// vite-plus bump keeps installing the previous runner. This repo carried vitest 4.1.10
// (GHSA-82fw-gwwq-j7x9) under vite-plus 0.2.4 until 2026-09-25, with every pin consistent, which is
// why the fixed version is asserted as a floor on top of the alignment.

type LockEntry = { name?: string, version: string, dependencies?: Record<string, string> }

const installed = (pattern: RegExp): [string, LockEntry][] =>
  Object.entries(lock.packages as Record<string, LockEntry>).filter(([path]) => pattern.test(path))

type Version = [number, number, number]
const parse = (version: string): Version => {
  const [major = NaN, minor = NaN, patch = NaN] = version.split('.').map(Number)
  return [major, minor, patch]
}
const atLeast = ([a, b, c]: Version, [x, y, z]: Version) => a !== x ? a > x : b !== y ? b > y : c >= z

describe('the vite-plus toolchain is pinned as one release', () => {
  const vitePlus = lock.packages['node_modules/vite-plus'] as LockEntry
  const core = `npm:@voidzero-dev/vite-plus-core@${vitePlus.version}`
  const vitests = installed(/(^|\/)node_modules\/(vitest|@vitest\/[^/]+)$/)

  it('the vite alias names the core of the installed vite-plus, everywhere npm reads it', () => {
    expect(manifest.devDependencies['vite-plus']).toBe(vitePlus.version)
    expect(manifest.devDependencies.vite).toBe(core)
    expect(manifest.overrides.vite).toBe(core)
    const vites = installed(/(^|\/)node_modules\/vite$/).map(([, entry]) => `${entry.name}@${entry.version}`)
    expect(vites).toEqual([`@voidzero-dev/vite-plus-core@${vitePlus.version}`])
  })

  it('the vitest pin is the vitest vite-plus itself depends on, and the direct dependency follows it', () => {
    expect(vitePlus.dependencies?.vitest).toBeDefined()
    expect(manifest.overrides.vitest).toBe(vitePlus.dependencies?.vitest)
    expect(manifest.devDependencies.vitest).toBe(manifest.overrides.vitest)
  })

  it('one vitest is installed, and every @vitest package is at the pinned version', () => {
    expect(vitests.length, 'the scan found no vitest at all, so it proves nothing').toBeGreaterThan(1)
    const off = vitests
      .filter(([, entry]) => entry.version !== manifest.overrides.vitest)
      .map(([path, entry]) => `${path}@${entry.version}`)
    expect(off).toEqual([])
    expect(vitests.filter(([path]) => path.endsWith('node_modules/vitest'))).toHaveLength(1)
  })

  it('no vitest package is below 4.1.11, the fix for GHSA-82fw-gwwq-j7x9', () => {
    expect(vitests.length, 'the scan found no vitest at all, so it proves nothing').toBeGreaterThan(1)
    const below = vitests
      .filter(([, entry]) => !atLeast(parse(entry.version), [4, 1, 11]))
      .map(([path, entry]) => `${path}@${entry.version}`)
    expect(below).toEqual([])
  })
})

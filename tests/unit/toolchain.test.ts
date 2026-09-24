/// <reference types="vite/client" />
import { describe, expect, it } from 'vite-plus/test'

// Imported through vite (as JSON, and ?raw) rather than read with node:fs, which vite.config.ts aliases
// to an empty browser shim through vite-plugin-node-polyfills, and that config is what vp test runs under.
import manifest from '../../package.json'
import lock from '../../package-lock.json'
import nodeVersion from '../../.node-version?raw'

// vite-plus bundles its own vitest and ships vite as vite-plus-core, and its docs require a project to
// pin both to the same release ("Updating the Vitest Pin" at viteplus.dev). A pin left behind on a
// vite-plus bump keeps installing the previous runner. This repo carried vitest 4.1.10
// (GHSA-82fw-gwwq-j7x9) under vite-plus 0.2.4 until 2026-09-25, with every pin consistent, which is
// why the fixed version is asserted as a floor on top of the alignment.

type LockEntry = {
  name?: string, version: string, dependencies?: Record<string, string>, engines?: { node?: string },
  optional?: boolean, os?: string[], cpu?: string[], libc?: string[],
}

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

// Cloudflare Pages builds on whatever .node-version names, and on node 22.16.0 without one, which is
// below vite-plus's own floor. npm only warns for a regular dependency, but drops an OPTIONAL native
// binding that fails its engine check without a word, so a floor raised past the pin breaks the deploy
// and nothing local. The ranges these packages publish are ^x.y.z and >=x.y.z joined by ||; anything
// else throws rather than being guessed at.
const satisfies = (version: string, range: string) => range.split('||').some(clause => {
  const match = /^(\^|>=)\s*(\d+\.\d+\.\d+)$/.exec(clause.trim())
  if (!match?.[2]) throw new Error(`unsupported engines clause: ${clause}`)
  const [have, floor] = [parse(version), parse(match[2])]
  return atLeast(have, floor) && (match[1] === '>=' || have[0] === floor[0])
})

describe('Pages builds on a node the toolchain accepts', () => {
  const pinned = nodeVersion.trim()

  it('the range check can tell an accepted node from a refused one (control)', () => {
    expect(satisfies('24.21.0', '^20.19.0 || ^22.18.0 || >=24.11.0')).toBe(true)
    expect(satisfies('22.16.0', '^20.19.0 || ^22.18.0 || >=24.11.0')).toBe(false)
    expect(satisfies('21.0.0', '^20.19.0 || >=24.11.0')).toBe(false)
    expect(satisfies('12.0.0', '>= 12.0.0')).toBe(true)
  })

  it('.node-version satisfies vite-plus, vite-plus-core and vitest', () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/)
    const refused = ['node_modules/vite-plus', 'node_modules/vite', 'node_modules/vitest']
      .map(path => [path, (lock.packages as Record<string, LockEntry>)[path]?.engines?.node] as const)
      .filter(([, range]) => !range || !satisfies(pinned, range))
    expect(refused).toEqual([])
  })

  it('.node-version satisfies every linux x64 glibc native binding, which is what the Pages image installs', () => {
    const natives = installed(/./).filter(([, entry]) =>
      entry.optional && entry.os?.includes('linux') && entry.cpu?.includes('x64') && !entry.libc?.includes('musl'))
    expect(natives.map(([path]) => path)).toContain('node_modules/@voidzero-dev/vite-plus-linux-x64-gnu')
    const refused = natives
      .filter(([, entry]) => entry.engines?.node && !satisfies(pinned, entry.engines.node))
      .map(([path, entry]) => `${path} ${entry.engines?.node}`)
    expect(refused).toEqual([])
  })
})

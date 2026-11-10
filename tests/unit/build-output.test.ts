/// <reference types="vite/client" />
import { build, type Plugin } from 'vite-plus'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import headers from '../../public/_headers?raw'

const root = new URL('../..', import.meta.url).pathname
const publicFiles = Object.keys(import.meta.glob('../../public/**/*')).map(path => path.replace('../../public', ''))

// Pages starts a rule at a trimmed line that begins with a path, and reads each `Name: value` line after it as one of
// its headers (workers-sdk, workers-shared/utils/configuration/parseHeaders.ts)
const rules = headers.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  .reduce<{ path: string, headers: [string, string][] }[]>((all, line) => {
    if (/^(\/|\S+:\/\/)/.test(line)) return [...all, { path: line, headers: [] }]
    const colon = line.indexOf(':')
    all.at(-1)?.headers.push([line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()])
    return all
  }, [])

// a splat matches anything and a :placeholder one segment, and every matching rule's value is joined with a comma
const cacheControl = (path: string) => rules
  .filter(rule => new RegExp(`^${rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:\w+/g, '[^/]+')}$`).test(path))
  .flatMap(rule => rule.headers.filter(([name]) => name === 'cache-control').map(([, value]) => value))
  .join(', ') || undefined

const YEAR = 'public, max-age=31536000, immutable'

const buildFiles = async (...plugins: Plugin[]) => {
  const result = await build({ root, configFile: `${root}vite.config.ts`, logLevel: 'silent', build: { write: false }, plugins })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(output => 'output' in output ? output.output : [])
  return {
    files: new Map(outputs.map(file => [file.fileName, file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : ''])),
    imports: new Map(outputs.flatMap(file => file.type === 'chunk' ? [[file.fileName, [...file.imports, ...file.dynamicImports]] as const] : [])),
  }
}

let files = new Map<string, string>()
let imports = new Map<string, readonly string[]>()

// as `vp build` runs for a deploy: outside production the Preact preset adds its debug module to whichever of the three
// pages it resolves first, which varies from one build to the next
beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production')
  ;({ files, imports } = await buildFiles())
}, 120_000)

afterAll(() => {
  vi.unstubAllEnvs()
})

const renamed = (from: Map<string, string>, to: Map<string, string>) => [...from.keys()].filter(name => !to.has(name)).sort()
const buildOf = (page = '') => /<meta name="yt-build" content="([^"]*)"/.exec(page)?.[1]

describe('a deploy renames only the files whose code changed', () => {
  it('a second build of the same tree names a new build and gives every file the same name', async () => {
    const again = await buildFiles()
    expect(buildOf(again.files.get('index.html'))).not.toBe(buildOf(files.get('index.html')))
    expect(again.files.size).toBe(files.size)
    expect(renamed(files, again.files)).toEqual([])
  }, 120_000)

  it('a change to one page renames its file and the files that import it, directly or through others', async () => {
    const edit: Plugin = {
      name: 'edit-privacy',
      enforce: 'pre',
      transform: (code, id) => id.endsWith('/src/routes/privacy.tsx') ? code.replace('>Privacy<', '>Privacy!<') : undefined,
    }
    const edited = await buildFiles(edit)
    const dependents = new Set([...files.keys()].filter(name => /^assets\/privacy-[\w-]{8}\.js$/.test(name)))
    expect(dependents.size).toBe(1)
    for (let grew = true; grew;) {
      grew = false
      for (const [name, imported] of imports) {
        if (dependents.has(name) || !imported.some(file => dependents.has(file))) continue
        dependents.add(name)
        grew = true
      }
    }
    expect(renamed(files, edited.files)).toEqual([...dependents].sort())
  }, 120_000)

  it('the app and both engine pages name one build in their HTML, and no other file carries it', () => {
    const builds = ['index.html', '__yt_scramjet__/host.html', '__yt_scramjet__/signin.html'].map(page => buildOf(files.get(page)))
    expect(builds[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Set(builds)).toEqual(new Set([builds[0]]))
    expect([...files].filter(([name, text]) => !name.endsWith('.html') && text.includes(builds[0]!)).map(([name]) => name)).toEqual([])
  })
})

describe('repeat visits take the build\'s hashed files from the browser cache', () => {
  it('every file the build puts under assets/ has a content hash in its name, and _headers gives each of them a year', () => {
    const assets = [...files.keys()].filter(name => name.startsWith('assets/'))
    expect(assets.length).toBeGreaterThan(40)
    expect(assets.filter(name => !/-[\w-]{8}\.\w+$/.test(name))).toEqual([])
    expect(assets.filter(name => cacheControl(`/${name}`) !== YEAR)).toEqual([])
  })

  it('index.html, the app\'s routes, the engine pages and every other public file keep Pages\' revalidation', () => {
    const pages = [...files.keys()].filter(name => !name.startsWith('assets/')).map(name => `/${name}`)
    expect(pages).toEqual(expect.arrayContaining(['/index.html', '/__yt_scramjet__/host.html']))
    expect(publicFiles).toContain('/__yt_scramjet__/sw.js')
    const others = publicFiles.filter(path => path !== '/_headers' && !path.startsWith('/assets/'))
    const paths = ['/', '/watch', '/__yt_scramjet__/host', '/__yt_scramjet__/scramjet/scramjet.wasm', ...pages, ...others]
    expect(paths.filter(path => cacheControl(path) !== undefined)).toEqual([])
  })

  it('a missing assets/ file finds assets/404.html before the app\'s index.html, and that page is the only unhashed file there', () => {
    expect(publicFiles.filter(path => path.startsWith('/assets/'))).toEqual(['/assets/404.html'])
  })
})

describe('Roboto comes from the build', () => {
  it('the built index.html preloads the latin Roboto file its linked stylesheet draws with', () => {
    const html = files.get('index.html') ?? ''
    const preload = /<link rel="preload" href="(\/assets\/roboto-latin-[\w-]{8}\.woff2)" as="font" type="font\/woff2" crossorigin/.exec(html)?.[1]
    expect(preload).toBeDefined()
    const stylesheet = /<link rel="stylesheet" crossorigin href="\/(assets\/[^"]+\.css)">/.exec(html)?.[1] ?? ''
    const faces = [...(files.get(stylesheet) ?? '').matchAll(/@font-face\{font-family:Roboto;[^}]*src:url\(([^)]+)\)/g)].map(([, url]) => url)
    expect(faces).toHaveLength(9)
    expect(faces).toContain(preload)
    expect(faces.filter(url => !files.has(url!.slice(1)))).toEqual([])
  })

  it('no built file names fonts.googleapis.com', () => {
    expect(files.size).toBeGreaterThan(40)
    expect([...files].filter(([, text]) => text.includes('fonts.googleapis.com')).map(([name]) => name)).toEqual([])
  })
})

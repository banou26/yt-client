/// <reference types="vite/client" />
import { describe, expect, it } from 'vite-plus/test'

import { DIRECT_HOSTS, FKN_DOMAINS } from '../../src/privacy-hosts'
import fehistory from './history/fehistory.json'
import uploadsFeed from './fixtures/uulf-computerphile.xml?raw'

const within = (hostname: string, domain: string) => hostname === domain || hostname.endsWith(`.${domain}`)
const listed = (hostname: string) => DIRECT_HOSTS.some(({ domain }) => within(hostname, domain))
const fkn = (hostname: string) => FKN_DOMAINS.some((domain) => within(hostname, domain))

// raw text through vite, since vite.config.ts shims node:fs to an empty module under vp test; the two build outputs
// are left out (codegen's comments name its docs, and the frame bundle is src/frame, which is scanned as source)
const sources = import.meta.glob(
  [
    '../../src/**/*.{ts,tsx,css,html}',
    '!../../src/generated/**',
    '../../index.html',
    '../../__yt_scramjet__/*.html',
    '../../public/**/*.js',
    '!../../public/__yt_scramjet__/youtube-frame.js',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

// A host these files name but the browser never loads itself: the engine frame and the sign-in window run under
// Scramjet, whose every request goes out through FKN or the extension, and the rest only name it
const NOT_FETCHED_FROM_THE_PAGE: Record<string, string[]> = {
  'www.youtube.com': [
    'src/components/share-dialog.tsx',
    'src/engine/agent-protocol.ts',
    'src/frame/botguard.ts',
    'src/frame/sabr.ts',
    'src/frame/watch-page.ts',
    'src/scramjet/fkn-transport.ts',
    'src/scramjet/signin-window.ts',
    'src/sources/youtube/channel-feed.ts',
    'src/sources/youtube/index.ts',
  ],
  'accounts.google.com': ['src/scramjet/signin-window.ts'],
  'yt-client.local': ['src/graphql.ts'],
}

// Named by no code or fixture: the font files Google's stylesheet links to, the standard live chat emoji in YouTube's
// own emoji list (fonts.gstatic.com/s/e/notoemoji, read 2026-11-05), and the channel pictures and banners a signed-in
// session on youtube.fkn.app loaded on 2026-11-02
const MEASURED = ['fonts.gstatic.com', 'yt3.googleusercontent.com']

const urlHosts = (text: string) => [...text.matchAll(/\bhttps?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)].map(([, host]) => host!.toLowerCase())

// YouTube's image shape, in thumbnails and image sources alike: a url with its size
const imageHosts = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(imageHosts)
  if (!value || typeof value !== 'object') return []
  const { url, width } = value as { url?: unknown, width?: unknown }
  const own = typeof url === 'string' && typeof width === 'number' ? [new URL(url, 'https://base.invalid').hostname] : []
  return [...own, ...Object.values(value).flatMap(imageHosts)]
}

describe('the hosts the privacy page lists', () => {
  it('cover every host the code names, but the ones it only reaches through FKN or never loads', () => {
    const unlisted = Object.entries(sources).flatMap(([path, text]) => {
      const file = path.replace(/^(\.\.\/)+/, '')
      return urlHosts(text)
        .filter((host) => !listed(host) && !fkn(host) && !NOT_FETCHED_FROM_THE_PAGE[host]?.includes(file))
        .map((host) => `${file}: ${host}`)
    })
    expect(Object.keys(sources).length).toBeGreaterThan(100)
    expect(Object.keys(sources)).toContain('../../public/__yt_scramjet__/sw.js')
    expect(unlisted).toEqual([])
  })

  it('cover every image host in real YouTube answers', () => {
    const hosts = new Set([
      ...imageHosts(fehistory),
      ...[...uploadsFeed.matchAll(/<media:thumbnail url="([^"]+)"/g)].map(([, url]) => new URL(url!).hostname),
    ])
    expect([...hosts].sort()).toEqual(['i.ytimg.com', 'i1.ytimg.com', 'i2.ytimg.com', 'i3.ytimg.com', 'i4.ytimg.com', 'yt3.ggpht.com'])
    expect([...hosts].filter((host) => !listed(host))).toEqual([])
  })

  it('cover the hosts sessions were seen reaching', () => {
    expect(MEASURED.filter((host) => !listed(host))).toEqual([])
  })
})

/// <reference types="vite/client" />
import { describe, expect, it } from 'vite-plus/test'

// A recorded YouTube answer carries the address it was fetched from (googlevideo's `ip=` in onesie and playback URLs,
// measured 2026-11-10), and this repo is public. Only the documentation ranges may appear.
// raw text through vite, since vite.config.ts shims node:fs to an empty module under vp test
const fixtures = import.meta.glob<string>('./fixtures/*.{json,html,xml}', { query: '?raw', import: 'default', eager: true })
const DOCUMENTATION = [/^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./, /^2001:db8:/i]
const IPV4 = /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g
// at least three colons, so a clock time such as 1:02:03 never reads as one
const IPV6 = /(?<![\w:])(?:[0-9a-f]{0,4}:){3,7}[0-9a-f]{1,4}(?![\w:])/gi
const IP_PARAM = /[?&]ip=([^&"\s]+)/g

const addresses = (text: string) => [
  ...[...text.matchAll(IP_PARAM)].map(match => decodeURIComponent(match[1]!)),
  ...[...text.matchAll(IPV4)].map(match => match[0]),
  ...[...text.matchAll(IPV6)].map(match => match[0]),
].filter(address => !DOCUMENTATION.some(range => range.test(address)))

describe('recorded fixtures', () => {
  it('carry no network address of the machine that recorded them', () => {
    const names = Object.keys(fixtures)
    expect(names.length).toBeGreaterThan(10)
    const found = Object.entries(fixtures).flatMap(([name, text]) => addresses(text).map(address => `${name}: ${address}`))
    expect(found).toEqual([])
  })

  it('finds an address in a googlevideo URL and a bare one', () => {
    expect(addresses('https://rr3---sn-x.googlevideo.com/initplayback?id=1&ip=8.8.8.8&mt=1')).toEqual(['8.8.8.8', '8.8.8.8'])
    expect(addresses('"remoteHost": "2001:4860:4860::8888", "ip": "8.8.4.4"')).toEqual(['8.8.4.4', '2001:4860:4860::8888'])
    expect(addresses('?ip=192.0.2.1&x=1 at 1:02:03, 2001:db8::1')).toEqual([])
  })
})

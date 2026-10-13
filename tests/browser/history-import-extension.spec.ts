import type { BrowserContext, Page } from '@playwright/test'

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { chromium, expect, test } from '@playwright/test'

import { extensionBuild } from './extension-build'
import { selfSigned } from './self-signed'

/* www.youtube.com is a local TLS stand-in answering FEhistory for whichever account the browser's jar is signed in to,
   so the import runs end to end through the real unpacked extension; every other host keeps its own route */

const FIXTURE = readFileSync(new URL('../unit/history/fehistory.json', import.meta.url), 'utf8')
const A_IDS = ['C0DPdy98e4c', 'jNQXAC9IVRw', 'dQw4w9WgXcQ']
const B_IDS = ['BaW_jenozKc', 'aqz-KE-bpKQ', 'YbJOTdZBX1g']
const answersOf = (ids: string[]) =>
  JSON.parse(A_IDS.reduce((text, id, index) => text.replaceAll(id, ids[index]!), FIXTURE)) as { first: unknown, next: unknown }
const ACCOUNTS: Record<string, { ids: string[], answers: { first: unknown, next: unknown } }> = {
  'sapisid-a': { ids: A_IDS, answers: answersOf(A_IDS) },
  'sapisid-b': { ids: B_IDS, answers: answersOf(B_IDS) },
}

type Seen = { sapisid?: string, hashed: boolean }

const standIn = async (seen: Seen[]) => {
  const tls = selfSigned('www.youtube.com')
  const server = createServer(tls, (request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      if (request.method !== 'POST' || !request.url?.startsWith('/youtubei/v1/browse')) return response.writeHead(404).end()
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as { browseId?: string, continuation?: string }
      const jar = new Map((request.headers.cookie ?? '').split(/;\s*/).filter(Boolean).map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]))
      const [, time, hash] = String(request.headers.authorization ?? '').match(/^SAPISIDHASH (\d+)_(\w+)$/) ?? []
      const sapisid = jar.get('SAPISID')
      seen.push({ sapisid, hashed: hash === createHash('sha1').update(`${time} ${sapisid} https://www.youtube.com`).digest('hex') })
      const account = jar.has('LOGIN_INFO') ? ACCOUNTS[sapisid ?? ''] : undefined
      const answer = body.browseId === 'FEhistory' ? account?.answers.first : body.continuation === 'fixture-continuation' ? account?.answers.next : undefined
      response.writeHead(answer ? 200 : 401, { 'content-type': 'application/json' }).end(JSON.stringify(answer ?? {}))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, port: (server.address() as { port: number }).port, spki: tls.spki }
}

const signInTo = async (context: BrowserContext, account: 'a' | 'b' | undefined) => {
  await context.clearCookies({ domain: '.youtube.com' })
  if (!account) return
  const cookie = { domain: '.youtube.com', path: '/', secure: true, sameSite: 'None' as const }
  await context.addCookies([
    { ...cookie, name: 'SAPISID', value: `sapisid-${account}` },
    { ...cookie, name: '__Secure-3PAPISID', value: `sapisid-${account}` },
    { ...cookie, name: 'LOGIN_INFO', value: `login-${account}`, httpOnly: true },
  ])
}

const acceptSheet = async (page: Page) => {
  await expect.poll(() => page.frames().some(frame => frame.url().includes('/permission/prompt/')), { timeout: 20_000 }).toBe(true)
  const apply = page.frames().find(frame => frame.url().includes('/permission/prompt/'))!.getByRole('button', { name: 'Apply' })
  await expect(apply).toBeEnabled({ timeout: 15_000 })
  await apply.click()
}

const shownIds = (page: Page) => page.evaluate(() =>
  [...new Set([...document.querySelectorAll('main a[href^="/watch?v="]')].map(link => link.getAttribute('href')!.slice(9, 20)))].sort())

const databases = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map(({ name }) => name))

test.describe('importing the history with the FKN extension installed', () => {
  test('keeps the copy of the YouTube session it came from, and drops it once the browser is on another or none', async ({ baseURL }) => {
    test.setTimeout(300_000)
    const build = extensionBuild(process.env)
    test.skip(build.skip !== undefined, `YT_EXTENSION_BUILD=skip: ${build.skip}`)
    const seen: Seen[] = []
    const youtube = await standIn(seen)
    const context = await chromium.launchPersistentContext('', {
      headless: true,
      executablePath: '/etc/profiles/per-user/banou/bin/google-chrome',
      // playwright's --disable-extensions default defeats the load, and --load-extension no longer works
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        '--mute-audio',
        '--enable-unsafe-extension-debugging',
        `--host-resolver-rules=MAP www.youtube.com 127.0.0.1:${youtube.port}`,
        `--ignore-certificate-errors-spki-list=${youtube.spki}`,
      ],
      viewport: { width: 1280, height: 900 },
    })
    const elsewhere: string[] = []
    context.on('request', request => {
      if (!['www.youtube.com', 'i.ytimg.com', 'yt3.ggpht.com'].includes(new URL(request.url()).host)) {
        elsewhere.push(`${request.url()} ${JSON.stringify(request.headers())} ${request.postData() ?? ''}`)
      }
    })

    try {
      const session = await context.browser()!.newBrowserCDPSession()
      await session.send('Extensions.loadUnpacked' as 'Browser.getVersion', { path: build.path } as object)
      if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker')
      const page = await context.newPage()
      const main = page.getByRole('main')
      const importOffer = main.getByRole('button', { name: 'Import from YouTube on this browser' })
      const importAgain = main.getByRole('button', { name: 'Import again' })

      await test.step('imports the history of account A and keeps it across a reload', async () => {
        await signInTo(context, 'a')
        await page.goto(`${baseURL}/feed/history`, { waitUntil: 'domcontentloaded' })
        await importOffer.click({ timeout: 90_000 })
        await acceptSheet(page)
        await expect.poll(() => shownIds(page), { timeout: 60_000 }).toEqual([...A_IDS].sort())
        expect(seen.filter(({ sapisid }) => sapisid)).toEqual([{ sapisid: 'sapisid-a', hashed: true }, { sapisid: 'sapisid-a', hashed: true }])
        await page.reload()
        await expect(importAgain).toBeVisible({ timeout: 90_000 })
        expect(await shownIds(page)).toEqual([...A_IDS].sort())
        await expect(main.locator('.section-title').first()).toHaveText('Yesterday')
        await expect(main.getByRole('link', { name: 'Simon Yapp' }).first()).toHaveAttribute('href', '/channel/UCHDm-DKoMyJxKVgwGmuTaQA')
      })

      await test.step('drops the copy once the browser is signed in to account B', async () => {
        await signInTo(context, 'b')
        await page.reload()
        await expect(importOffer).toBeVisible({ timeout: 90_000 })
        expect(await shownIds(page)).toEqual([])
        expect(await databases(page)).not.toContain('yt-client-history')
      })

      await test.step('drops the copy of account B once the browser signs out of YouTube', async () => {
        await importOffer.click()
        await expect.poll(() => shownIds(page), { timeout: 60_000 }).toEqual([...B_IDS].sort())
        await signInTo(context, undefined)
        await page.reload()
        await expect(importOffer).toBeVisible({ timeout: 90_000 })
        expect(await shownIds(page)).toEqual([])
        expect(await databases(page)).not.toContain('yt-client-history')
      })

      await test.step('drops the copy on screen when Import again finds the browser signed out', async () => {
        await signInTo(context, 'b')
        await importOffer.click()
        await expect.poll(() => shownIds(page), { timeout: 60_000 }).toEqual([...B_IDS].sort())
        await signInTo(context, undefined)
        await importAgain.click()
        await expect(main.getByText('This browser is not signed in to YouTube')).toBeVisible({ timeout: 30_000 })
        expect(await shownIds(page)).toEqual([])
        await expect.poll(() => databases(page)).not.toContain('yt-client-history')
      })

      await test.step('deletes the copy on screen with one control', async () => {
        await signInTo(context, 'a')
        await importOffer.click()
        await expect.poll(() => shownIds(page), { timeout: 60_000 }).toEqual([...A_IDS].sort())
        await main.getByRole('button', { name: 'Delete imported history' }).click()
        await expect(importOffer).toBeVisible()
        expect(await shownIds(page)).toEqual([])
        await expect.poll(() => databases(page)).not.toContain('yt-client-history')
      })

      const secrets = ['sapisid-a', 'sapisid-b', 'login-a', 'login-b', 'SAPISIDHASH']
      expect(elsewhere.length).toBeGreaterThan(0)
      expect(elsewhere.filter(request => secrets.some(secret => request.includes(secret)))).toEqual([])
    } finally {
      await context.close()
      youtube.server.close()
    }
  })
})

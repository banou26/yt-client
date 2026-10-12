/* The wall verdict on a watch page of the live app, by the seek method: once playing, set currentTime = 90.
   A pass is buffered covering 90 within 25 s; a session held at the ~60s preview buffers nothing past 60.

     env -u WAYLAND_DISPLAY -u NIXOS_OZONE_WL xvfb-run -a -s "-screen 0 1280x720x24" \
       node tests/live/wall.mjs --arm=none|extension [--control=detector|webdriver] [--video=ID] [--base=URL] [--label=NAME]
         [--profile=DIR]

   --arm=extension loads the store build: the crx Chrome's update service serves for the listing, unpacked.
   --control=detector plays dQw4w9WgXcQ, which is not enforced, and must pass: it shows the detector can read a pass.
   --control=webdriver leaves navigator.webdriver true and must wall on an enforced video: it shows a wall can be read.
   --profile=DIR runs on a copy of that Chrome profile, made in the run's scratch directory and removed with it, never
     on DIR itself, and without DIR's service workers (wall-read.ts says why). DIR is listed (size and mtime of every entry) before the copy and after the removal, and a run
     that finds it changed is refused. The copy is listed the same way and must show Chrome's writes, which proves
     the listing can see a change. A profile run that never shows the account menu is refused as signed out.

   Headful under Xvfb, never a real window, muted, a fresh profile per run unless --profile names one. Prints one
   RESULT line and exits 0 on a pass, 1 on a wall, 2 with no verdict. Nothing identifiable is read or printed: the
   token store and the account menu are reported as present or absent only. */
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cp, lstat, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { bestAccount, held, keptInCopy, manifestChanges, sleep, tokenStored, unpassed, withTimeout } from './wall-read.ts'

const flags = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, ...value] = arg.replace(/^--/, '').split('=')
  return [key, value.join('=') || 'true']
}))
const ARM = flags.arm
const CONTROL = flags.control ?? null
if (ARM !== 'none' && ARM !== 'extension') throw new Error('--arm=none|extension is required')
if (CONTROL !== null && CONTROL !== 'detector' && CONTROL !== 'webdriver') throw new Error('--control is detector or webdriver')
if (process.env.WAYLAND_DISPLAY || process.env.NIXOS_OZONE_WL || !process.env.DISPLAY) {
  throw new Error('run under env -u WAYLAND_DISPLAY -u NIXOS_OZONE_WL xvfb-run, or the Chrome wrapper opens a real window')
}

const VIDEO = flags.video ?? (CONTROL === 'detector' ? 'dQw4w9WgXcQ' : 'FAlMdord_Fg')
const BASE = flags.base ?? 'https://youtube.fkn.app'
const LABEL = flags.label ?? `${ARM}-${Date.now().toString(36)}`
const PROFILE = flags.profile ? resolve(flags.profile) : null
const CHROME = '/etc/profiles/per-user/banou/bin/google-chrome-stable'
const STORE_ID = 'ffeddppgmgpnjagcklkfefpdnaoefckf'
const TARGET = 90
const SEEK_WINDOW_MS = 25_000
const EGRESS = { none: 'FKN relay + webvpn tunnel', extension: 'FKN extension (direct native fetch)' }

const storeExtension = async dir => {
  const response = await fetch(`https://clients2.google.com/service/update2/crx?response=redirect&prodversion=153.0&acceptformat=crx3&x=id%3D${STORE_ID}%26uc`)
  if (!response.ok) throw new Error(`the update service answered ${response.status}`)
  const crx = Buffer.from(await response.arrayBuffer())
  if (crx.toString('latin1', 0, 4) !== 'Cr24' || crx.readUInt32LE(4) !== 3) throw new Error('the update service served no crx3')
  // a crx3 is a 12 byte preamble and a signed header of the length at offset 8, then a plain zip
  const zip = join(dir, 'store.zip')
  await writeFile(zip, crx.subarray(12 + crx.readUInt32LE(8)))
  const unpacked = join(dir, 'unpacked')
  execFileSync('python3', ['-c', 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', zip, unpacked])
  return { path: unpacked, version: JSON.parse(await readFile(join(unpacked, 'manifest.json'), 'utf8')).version }
}

const manifestOf = async dir => Object.fromEntries(await Promise.all((await readdir(dir, { recursive: true })).map(async path => {
  const entry = await lstat(join(dir, path))
  return [path, `${entry.isFile() ? entry.size : entry.isDirectory() ? 'dir' : 'link'}:${entry.mtimeMs}`]
})))

// Chrome holds SingletonLock for as long as it has the profile open, and a copy taken then would be torn
const copyProfile = async (master, to) => {
  await lstat(join(master, 'Local State')).catch(() => { throw new Error(`${master} holds no Chrome profile`) })
  if (await lstat(join(master, 'SingletonLock')).catch(() => null)) throw new Error(`a Chrome has ${master} open`)
  await cp(master, to, { recursive: true, verbatimSymlinks: true, filter: keptInCopy(master) })
}

/* Runs in the top document from its first byte. A player retry mounts a fresh <video> and an engine rebuild a
   fresh host frame, so counting each one the document ever held is what tells the session under test from a
   recovered one; data-engine is recorded as its sequence of values. */
const observeRecovery = () => {
  if (window !== window.top) return
  const seen = { videos: 0, hosts: 0, engine: [] }
  const videos = new WeakSet()
  const hosts = new WeakSet()
  const scan = () => {
    for (const video of document.querySelectorAll('[data-player-root] video')) {
      if (videos.has(video)) continue
      videos.add(video)
      seen.videos++
    }
    for (const frame of document.querySelectorAll('iframe[src$="/__yt_scramjet__/host.html"]')) {
      if (hosts.has(frame)) continue
      hosts.add(frame)
      seen.hosts++
    }
    const engine = document.documentElement?.dataset.engine
    if (engine && engine !== seen.engine.at(-1)) seen.engine.push(engine)
  }
  window.__wall = seen
  new MutationObserver(scan).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-engine'] })
}

// the element is queried afresh on every call, since a retry replaces it and a held one reads a detached buffer
const sample = page => withTimeout(page.evaluate(target => {
  const round = n => Math.round(n * 10) / 10
  const seen = window.__wall ?? { videos: 0, hosts: 0, engine: [] }
  const video = document.querySelector('[data-player-root] video')
  const menu = document.querySelector('button[aria-label="Account menu"]')
  const base = {
    account: menu ? (menu.querySelector('img') ? 'avatar' : 'initial') : 'none',
    recovery: `${seen.videos}/${seen.hosts}/${seen.engine.join('>')}`,
    videos: seen.videos,
    hosts: seen.hosts,
    engine: seen.engine.join('>'),
    status: document.querySelector('[data-player-root] .playback-status')?.textContent ?? null,
    playbackRecovery: document.documentElement.dataset.playbackRecovery ?? null,
  }
  if (!video) return { ...base, video: false }
  const ranges = [...Array(video.buffered.length)].map((_, i) => [round(video.buffered.start(i)), round(video.buffered.end(i))])
  return {
    ...base,
    video: true,
    t: round(video.currentTime),
    paused: video.paused,
    ranges,
    covers: ranges.some(([start, end]) => start <= target && end >= target),
    maxEnd: Math.max(0, ...ranges.map(range => range[1])),
  }
}, TARGET), 4_000).catch(error => ({ video: false, error: String(error).slice(0, 80) }))

const frameRecovery = async page => {
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue
    const value = await withTimeout(frame.evaluate(() => document.documentElement?.dataset.segmentRecovery ?? null), 1_000).catch(() => null)
    if (value) return value
  }
  return null
}

const webdriverIn = async page => {
  const values = await Promise.all(page.frames().map(frame =>
    withTimeout(frame.evaluate(() => navigator.webdriver), 2_000).catch(() => null)))
  return { top: values[0], frames: values.slice(1).filter(value => value !== null) }
}

const run = async () => {
  const masterBefore = PROFILE ? await manifestOf(PROFILE) : null
  const work = await mkdtemp(join(tmpdir(), 'yt-wall-'))
  const r = {
    label: LABEL, arm: ARM, control: CONTROL, video: VIDEO, ext: null, webdriver: null, egress: [], extFetchFailed: false,
    account: null, profile: PROFILE ? { entries: Object.keys(masterBefore).length, master: null, copy: null } : null,
    engineAt: null, playAt: null, before: null, after: null, maxBuffered: 0, t: null, atSeek: null, recovery: null,
    refresh: { seek: null, end: null }, status: null, poTokens: { seek: null, end: null }, verdict: null, reason: null, seekMs: null, total: null,
  }
  const t0 = Date.now()
  const at = () => Math.round((Date.now() - t0) / 100) / 10
  let context
  let page
  let copyBefore = null
  try {
    if (PROFILE) {
      await copyProfile(PROFILE, join(work, 'profile'))
      copyBefore = await manifestOf(join(work, 'profile'))
    }
    const extension = ARM === 'extension' ? await storeExtension(work) : null
    r.ext = extension?.version ?? null
    context = await chromium.launchPersistentContext(join(work, 'profile'), {
      headless: false,
      executablePath: CHROME,
      ignoreDefaultArgs: [
        ...(CONTROL === 'webdriver' ? [] : ['--enable-automation']),
        ...(extension ? ['--disable-extensions'] : []),
      ],
      args: [
        '--mute-audio',
        '--ozone-platform=x11',
        '--autoplay-policy=no-user-gesture-required',
        ...(CONTROL === 'webdriver' ? [] : ['--disable-blink-features=AutomationControlled']),
        ...(extension ? ['--enable-unsafe-extension-debugging'] : []),
      ],
      viewport: { width: 1280, height: 720 },
    })
    if (extension) {
      const session = await context.browser().newBrowserCDPSession()
      await session.send('Extensions.loadUnpacked', { path: extension.path })
      if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker', { timeout: 30_000 })
    }
    page = await context.newPage()
    for (const blank of context.pages()) if (blank !== page) await blank.close()
    page.on('console', message => {
      const text = message.text()
      const egress = text.match(/\[yt-client\] egress → (.*)$/)
      if (egress) r.egress.push(egress[1])
      if (text.includes('extension fetch failed')) r.extFetchFailed = true
    })
    await page.addInitScript(observeRecovery)
    await page.goto(`${BASE}/watch?v=${VIDEO}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })

    const loadDeadline = Date.now() + 150_000
    let pausedSince = null
    while (Date.now() < loadDeadline) {
      const s = await sample(page)
      r.account = bestAccount(r.account, s.account ?? null)
      if (r.engineAt === null && s.engine?.startsWith('ready')) r.engineAt = at()
      if (s.engine?.includes('error') || s.status?.startsWith('Playback failed')) break
      if (s.video && !s.paused && s.t > 0.5) { r.playAt = at(); break }
      if (s.video && s.paused && s.t === 0 && r.engineAt !== null) {
        pausedSince ??= Date.now()
        if (Date.now() - pausedSince > 10_000) {
          await page.evaluate(() => document.querySelector('[data-player-root] video')?.play().catch(() => {})).catch(() => {})
          pausedSince = Date.now()
        }
      }
      await sleep(500)
    }
    r.webdriver = await webdriverIn(page)
    if (r.playAt === null) {
      const s = await sample(page)
      r.status = s.status ?? s.playbackRecovery
      r.recovery = s.recovery
      r.verdict = 'no-playback'
      r.reason = 'never played before the deadline'
      return r
    }

    // let the opening buffer form first, so the seek does not race the initial load
    const settle = Date.now()
    while (Date.now() - settle < 8_000) {
      const s = await sample(page)
      if (s.video && s.maxEnd >= 10) break
      await sleep(250)
    }
    const pre = await sample(page)
    r.poTokens.seek = await tokenStored(page)
    r.refresh.seek = await frameRecovery(page)
    r.before = pre.ranges ?? null
    r.atSeek = pre.recovery
    r.maxBuffered = 0

    await withTimeout(page.evaluate(target => {
      document.querySelector('[data-player-root] video').currentTime = target
    }, TARGET), 3_000)
    const seekStart = Date.now()
    let last = pre
    let ended = null
    while (Date.now() - seekStart < SEEK_WINDOW_MS) {
      const [s, refresh] = await Promise.all([sample(page), frameRecovery(page)])
      r.account = bestAccount(r.account, s.account ?? null)
      if (refresh) r.refresh.end = refresh
      // a sample taken after a retry or a rebuild belongs to another session, so it can decide nothing
      if (s.recovery !== undefined && s.recovery !== pre.recovery) {
        ended = { s: Math.round((Date.now() - seekStart) / 100) / 10, status: s.status ?? s.playbackRecovery }
        r.recovery = s.recovery
        break
      }
      if (s.video) {
        last = s
        if (s.maxEnd > r.maxBuffered) r.maxBuffered = s.maxEnd
        if (s.covers) {
          r.verdict = 'pass'
          r.seekMs = Date.now() - seekStart
          break
        }
      }
      await sleep(250)
    }
    r.after = last.ranges ?? null
    r.t = last.t ?? null
    r.recovery ??= last.recovery
    r.status = last.status ?? last.playbackRecovery
    if (r.verdict === null) {
      r.seekMs = Date.now() - seekStart
      Object.assign(r, unpassed({ target: TARGET, maxBuffered: r.maxBuffered, ended }))
    }
  } catch (error) {
    r.verdict ??= 'error'
    r.reason = String(error).split('\n')[0].slice(0, 200)
  } finally {
    if (page) {
      r.poTokens.end = await tokenStored(page)
      // the header asks for the session on its own schedule, so a profile run gives it time to show the menu
      const deadline = Date.now() + (PROFILE ? 15_000 : 0)
      for (;;) {
        r.account = bestAccount(r.account, (await sample(page)).account ?? null)
        if (r.account === 'avatar' || Date.now() >= deadline) break
        await sleep(500)
      }
    }
    await context?.close().catch(() => {})
    if (copyBefore) r.profile.copy = manifestChanges(copyBefore, await manifestOf(join(work, 'profile'))).length
    await rm(work, { recursive: true, force: true }).catch(() => {})
    if (PROFILE) r.profile.master = manifestChanges(masterBefore, await manifestOf(PROFILE))
    r.total = at()
  }
  return r
}

/* What turns a reading into no verdict: a session recovered before the seek, a webdriver flag that disagrees
   with the run, an egress line that disagrees with the arm or never printed, and a failed extension fetch,
   which drops the run onto the tunnel mid-session. */
const refusal = r => {
  if (r.profile && !r.profile.copy) return 'the listing saw no write by Chrome in the copy, so it proves nothing about the master'
  if (r.profile && r.account !== 'avatar') return `the profile copy never showed the account avatar (read ${r.account})`
  if (r.atSeek !== null && r.atSeek !== '1/1/ready') return `the seek landed on a recovered session (videos/hosts/engine ${r.atSeek})`
  const flagged = [r.webdriver?.top, ...(r.webdriver?.frames ?? [])]
  if (CONTROL === 'webdriver' ? r.webdriver?.top !== true : flagged.some(value => value !== false)) {
    return `navigator.webdriver read ${JSON.stringify(flagged)}`
  }
  if (!r.egress.length) return 'no egress line was printed'
  if (r.egress.some(line => line !== EGRESS[ARM])) return `the egress line disagrees with the arm: ${[...new Set(r.egress)].join(' | ')}`
  if (r.extFetchFailed) return 'the console carries "extension fetch failed"'
  return null
}

const r = await run()
// a master that moved is refused whatever the run read, so it can never pass as a measurement
if (r.profile?.master?.length) {
  r.reason = `the master profile changed: ${r.profile.master.slice(0, 5).join(', ')}; read ${String(r.verdict)}${r.reason ? `, ${String(r.reason)}` : ''}`
  r.verdict = 'refused'
} else if (r.verdict === 'pass' || r.verdict === 'wall') {
  const refused = refusal(r)
  if (refused) {
    r.reason = `${refused}; read ${String(r.verdict)}${r.reason ? `, ${String(r.reason)}` : ''}`
    r.verdict = 'refused'
  }
}
const control = CONTROL === null ? '' : ` held=${held(CONTROL, r.verdict)}`
const atSeekAndEnd = (reading, show) => ['seek', 'end'].map(when => `${when}:${reading[when] === null ? '-' : show(reading[when])}`).join(',')
const profile = r.profile
  ? `profile=copy master=${r.profile.master === null ? '-' : r.profile.master.length ? `changed:${r.profile.master.length}` : 'unchanged'}/${r.profile.entries} copy-writes=${r.profile.copy ?? '-'}`
  : 'profile=fresh'
const egress = [...new Set(r.egress.map(line => line === EGRESS.extension ? 'extension' : line === EGRESS.none ? 'relay' : line))].join('|') || '-'
console.log(
  `RESULT ${r.label} arm=${r.arm} ext=${r.ext ?? '-'} control=${r.control ?? '-'}${control} video=${r.video} ${profile} account=${r.account ?? '-'} `
    + `webdriver=${r.webdriver ? `${r.webdriver.top}/${r.webdriver.frames.join(',')}` : '-'} egress=${egress} extFetchFailed=${r.extFetchFailed} `
    + `engine@${r.engineAt}s play@${r.playAt}s atSeek=${r.atSeek} recovery=${r.recovery} before=${JSON.stringify(r.before)} `
    + `after=${JSON.stringify(r.after)} max=${r.maxBuffered} t=${r.t} po-tokens=${atSeekAndEnd(r.poTokens, value => value ? 'yes' : 'no')} `
    + `=> ${String(r.verdict)}${r.reason ? ` (${String(r.reason)})` : ''} seekMs=${r.seekMs} refresh=${atSeekAndEnd(r.refresh, String)} `
    + `status=${r.status ?? '-'} total=${r.total}s`,
)
process.exitCode = r.verdict === 'pass' ? 0 : r.verdict === 'wall' ? 1 : 2

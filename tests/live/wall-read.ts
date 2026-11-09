/* The readings of wall.mjs that need no browser, kept apart so tests/unit can pin them. wall.mjs imports
   this file as .ts, which node runs by stripping the types. */

export type Verdict = 'pass' | 'wall' | 'inconclusive' | 'refused' | 'no-playback' | 'error'

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, sleep(ms).then((): never => { throw new Error('timeout') })])

// presence only: the key exists once a live minter has stored a token, and a mint recovery deletes it, so the
// reading at the seek is the one-look probe for the session under test
export const tokenStored = (page: { evaluate: (read: () => boolean) => Promise<boolean> }) =>
  withTimeout(page.evaluate(() => localStorage.getItem('www.youtube.com@yt-client:po-tokens') !== null), 2_000).catch(() => null)

// --step=<name>[:0|1]: the localStorage key src/engine/step-flag.ts reads for that migration step and the value the
// run writes there, '1' unless it names '0', which turns off a step that is on by default; label is what RESULT prints
export const parseStep = (arg: string) => {
  const [name = '', value = '1', ...rest] = arg.split(':')
  if (!/^[a-z0-9]+$/.test(name) || rest.length > 0) throw new Error(`--step=${arg} names no step: a step is lowercase letters and digits`)
  if (value !== '0' && value !== '1') throw new Error(`--step=${arg} sets no value a step reads: 0 or 1`)
  return { key: `yt-client:step:${name}`, value, label: value === '1' ? name : `${name}:${value}` }
}

// an init script, so it runs in every frame: only the app's own document sets the step, before any of its code reads it
export const setStep = ({ origin, key, value }: { origin: string, key: string, value: string }) => {
  if (location.origin === origin) localStorage.setItem(key, value)
}

// the direct lane's state as the app published it on <html>: one of its three words, 'other' for any other value,
// null when the page published none or could not be read
export const directReported = (page: { evaluate: (read: () => string | null) => Promise<string | null> }) =>
  withTimeout(page.evaluate(() => {
    const value = document.documentElement.dataset.ytDirect
    return value === undefined ? null : ['on', 'off', 'skipped'].includes(value) ? value : 'other'
  }), 2_000).catch(() => null)

// A session that ended after the seek took its buffer with it, so it decides nothing: what it left behind reads
// the same after a wall as after any other failure.
export const unpassed = ({ target, maxBuffered, ended }: {
  target: number, maxBuffered: number, ended: { s: number, status: string | null } | null,
}): { verdict: Verdict, reason: string } => {
  if (ended) {
    const status = ended.status ? `: ${ended.status}` : ''
    return { verdict: 'refused', reason: `the first session ended ${ended.s}s after the seek${status}, having buffered to ${maxBuffered}` }
  }
  if (maxBuffered <= 61) return { verdict: 'wall', reason: `nothing buffered past 60 after seeking to ${target}; the window ran out` }
  return { verdict: 'inconclusive', reason: `buffered to ${maxBuffered} but never covered ${target}; the window ran out` }
}

// Each path under a profile mapped to what a write to it moves: a file's size and mtime, a directory's or link's mtime.
export type Manifest = Record<string, string>

export const manifestChanges = (before: Manifest, after: Manifest) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => before[path] !== after[path]).sort()

/* A profile copy leaves out the master's service workers. They hold the fkn.app shell of the day the master was
   signed in, so once a deploy renames that shell's chunks a copy's first load fails every request: measured
   2026-10-12, two copies with them read the account menu with no avatar and every playback start failed on a 500,
   while a copy without them showed the avatar and played. A reload recovers, which a single-load run never reaches. */
export const keptInCopy = (master: string) => (source: string) => source !== `${master}/Default/Service Worker`

// the header shows the account menu only for a signed-in session, holding an img once it has an avatar
export type Account = 'avatar' | 'initial' | 'none'

const ACCOUNT_RANK: Record<Account, number> = { none: 0, initial: 1, avatar: 2 }

export const bestAccount = (seen: Account | null, read: Account | null) =>
  read === null || (seen !== null && ACCOUNT_RANK[seen] >= ACCOUNT_RANK[read]) ? seen : read

// a control is held or failed only by a verdict, so a run that reached none prints '-'
export const held = (control: 'detector' | 'webdriver', verdict: Verdict | null) =>
  verdict !== 'pass' && verdict !== 'wall' ? '-' : String(control === 'detector' ? verdict === 'pass' : verdict === 'wall')

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

// a control is held or failed only by a verdict, so a run that reached none prints '-'
export const held = (control: 'detector' | 'webdriver', verdict: Verdict | null) =>
  verdict !== 'pass' && verdict !== 'wall' ? '-' : String(control === 'detector' ? verdict === 'pass' : verdict === 'wall')

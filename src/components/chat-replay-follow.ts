/** A replay line, placed by the point of the video it was said at. */
export type ReplayLine = { id: string, offsetMs?: number | null }

/** A page of a chat replay: no cursor is its end. */
export type ReplayPage<Line extends ReplayLine> = { items: Line[], cursor?: string | null }

// every replay page upstream sends says timeUntilLastMessageMsec 5000, and youtube.com asks for the next one once the
// playhead is that close to the last line it holds (measured on fOT0BUpITw8, 2026-11-10)
const LEAD_MS = 5_000
const TICK_MS = 250
// a step outside these between two ticks is a seek, which youtube.com answers by starting the replay over at the new
// point; playing at 2x moves 500 ms a tick, and a busy main thread stretches that
const SEEK_BACK_MS = 1_000
const SEEK_AHEAD_MS = 3_000
const IDLE_MS = 2_000
// a page that could not be read is asked again as live chat does: 500 ms, doubling up to 8 s
const RETRY_MS = 500
const RETRY_MAX_MS = 8_000

/**
 * Shows a chat replay in step with the playhead the way youtube.com's is: a line appears once the playhead reaches the
 * point it was said at, the next page is asked when the playhead nears the last line held, and a seek either way
 * clears the log and starts over from the new point. Returns the function that stops it, which also drops a page
 * still in flight.
 */
export const followChatReplay = <Line extends ReplayLine>({ playhead, fetchPage, show, onRestart, limit }: {
  /** The playhead in seconds, undefined while the video has no player. */
  playhead: () => number | undefined
  /** The page from `offsetMs`, or after `cursor` when there is one; undefined when it could not be read. */
  fetchPage: (offsetMs: number, cursor: string | undefined) => Promise<ReplayPage<Line> | undefined>
  /** Every line to show, oldest first, at most `limit` of them. */
  show: (lines: Line[]) => void
  /** Called on each seek, once the log is cleared. */
  onRestart: () => void
  limit: number
}) => {
  let shown: Line[] = []
  let pending: Line[] = []
  let cursor: string | undefined
  let reach = 0
  let ended = false
  let asking = false
  let waitUntil = 0
  let failures = 0
  let run = 0
  let last: number | undefined

  const display = (lines: Line[]) => {
    shown = lines.length > limit ? lines.slice(lines.length - limit) : lines
    show(shown)
  }

  const ask = async (at: number) => {
    asking = true
    const started = run
    const page = await fetchPage(Math.round(at), cursor).catch(() => undefined)
    if (started !== run) return
    asking = false
    if (!page) {
      // a cursor an engine reset dropped is unknown to the next engine, so the replay picks up again at the playhead
      cursor = undefined
      waitUntil = Date.now() + Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** failures)
      failures += 1
      return
    }
    failures = 0
    const known = new Set([...shown, ...pending].map((line) => line.id))
    const fresh = page.items.filter((line) => !known.has(line.id))
    pending = [...pending, ...fresh].sort((a, b) => (a.offsetMs ?? 0) - (b.offsetMs ?? 0))
    reach = Math.max(reach, ...page.items.map((line) => line.offsetMs ?? 0))
    cursor = page.cursor ?? undefined
    ended = cursor === undefined
    if (fresh.length === 0) waitUntil = Date.now() + IDLE_MS
  }

  const restart = () => {
    run += 1
    pending = []
    cursor = undefined
    reach = 0
    ended = false
    asking = false
    waitUntil = 0
    display([])
    onRestart()
  }

  const tick = () => {
    const seconds = playhead()
    if (seconds === undefined) return
    const at = seconds * 1_000
    if (last !== undefined && (at < last - SEEK_BACK_MS || at > last + SEEK_AHEAD_MS)) restart()
    last = at
    const due = pending.findIndex((line) => (line.offsetMs ?? 0) > at)
    const ready = due === -1 ? pending : pending.slice(0, due)
    if (ready.length > 0) {
      pending = pending.slice(ready.length)
      display([...shown, ...ready])
    }
    if (asking || ended || Date.now() < waitUntil) return
    if (cursor === undefined || reach - at < LEAD_MS) void ask(at)
  }

  display([])
  tick()
  const timer = setInterval(tick, TICK_MS)
  return () => {
    clearInterval(timer)
    run += 1
  }
}

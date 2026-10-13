import type { SourceVideo } from '../sources/types'

import { WEB_CLIENT_VERSION } from '../sources/youtube/client-version'
import { normalizeFeedVideo, normalizeLockupVideo } from '../sources/youtube/normalize'
import { deleteImportedHistory, saveImportedHistory } from './store'

/**
 * One video of the imported copy. `watchedOn` is the local day YouTube's History page lists it under, as
 * `YYYY-MM-DD`; `heading` is that page's own heading, kept only when it names no day `dayOf` can read.
 */
export type HistoryEntry =
  Pick<SourceVideo, 'id' | 'title' | 'thumbnail' | 'durationSeconds' | 'progressPercent' | 'isLive' | 'isShort'>
  & {
    channel?: { id: string, name: string }
    watchedOn?: string
    heading?: string
  }

/** `session` names the browser's YouTube session the copy was read through: a digest of its SAPISID, never the cookie. */
export type ImportedHistory = { importedAt: number, session: string, entries: HistoryEntry[] }

/** The extension calls the import makes, all on the browser's own session; `platform.ts` binds them to `@fkn/lib`. */
export type BrowserSession = {
  requestNetwork: (hosts: string[], reason: string) => Promise<{ allow: boolean }[]>
  cookie: (details: { url: string, name: string }) => Promise<{ name: string, value: string } | null>
  fetch: (url: string, init: RequestInit) => Promise<Response>
}

const YOUTUBE_HOST = 'www.youtube.com'
const YOUTUBE_ORIGIN = `https://${YOUTUBE_HOST}`
const IMPORT_REASON = 'Import your watch history from YouTube on this browser'
const SHOW_REASON = 'Show the history you imported for the YouTube account on this browser'

/** A failed import whose message is the one line the History page shows. */
export class HistoryImportError extends Error {}

/** The browser is not signed in to YouTube, by its cookies or by YouTube's own answer. */
export class SignedOutError extends HistoryImportError {
  constructor() {
    super('This browser is not signed in to YouTube')
  }
}

/** The line the History page shows for a failed import or check. */
export const importFailure = (error: unknown) =>
  error instanceof HistoryImportError
    ? error.message
    : error instanceof Error && error.name === 'ExtensionOutdatedError'
      ? 'Update the FKN extension to import your history'
      : 'Could not import your history, try again'

type BrandedAgent = { userAgentData?: { brands?: { brand: string }[] } }

// the extension's fetch answers that carry a body never settle in a Firefox page (internal docs, extension: Not supported)
export const canImportBrowserHistory = (agent: BrandedAgent = navigator as Navigator & BrandedAgent) =>
  agent.userAgentData?.brands?.some(({ brand }) => brand === 'Chromium') === true

// yt-dlp counts a jar as signed in only with LOGIN_INFO; youtube.com hashes SAPISID, or __Secure-3PAPISID without it
const readSapisid = async (session: BrowserSession, reason: string) => {
  const [grant] = await session.requestNetwork([YOUTUBE_HOST], reason)
  if (!grant?.allow) throw new HistoryImportError('Allow YouTube access to import your history')
  const [login, sapisid, secure] = await Promise.all(
    ['LOGIN_INFO', 'SAPISID', '__Secure-3PAPISID'].map((name) => session.cookie({ url: YOUTUBE_ORIGIN, name })),
  )
  const value = sapisid?.value || secure?.value
  return login && value ? value : undefined
}

const sessionOf = async (sapisid: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`yt-client history ${sapisid}`))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// the browser attaches its own jar, so the cookie youtubei.js builds from the SAPISID is dropped: the extension refuses an app cookie beside credentials: 'include'
const sessionFetch = (session: BrowserSession): typeof fetch => async (input, init) => {
  const request = input instanceof Request ? input : new Request(input)
  const headers = new Headers(init?.headers ?? request.headers)
  headers.delete('cookie')
  headers.set('origin', YOUTUBE_ORIGIN)
  headers.set('referer', `${YOUTUBE_ORIGIN}/`)
  return session.fetch(request.url, { method: request.method, headers, body: init?.body ?? null, credentials: 'include' })
}

type HistoryPage = {
  sections?: { header?: { title?: { toString(): string } }, contents?: Iterable<unknown> }[]
  has_continuation: boolean
  getContinuation(): Promise<HistoryPage>
}

const MAX_PAGES = 500

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** The local day a History page heading names ("Today", "Yesterday", a weekday, "Oct 3", "Oct 3, 2024"), or undefined. */
export const dayOf = (heading: string | undefined, now: Date) => {
  const label = heading?.trim().toLowerCase()
  if (!label) return undefined
  const daysAgo = (days: number) => isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days))
  if (label === 'today') return daysAgo(0)
  if (label === 'yesterday') return daysAgo(1)
  const weekday = WEEKDAYS.indexOf(label)
  if (weekday !== -1) return daysAgo((now.getDay() - weekday + 7) % 7 || 7)
  const match = label.match(/^([a-z]+)\.? (\d{1,2})(?:, (\d{4}))?$/)
  const month = MONTHS.indexOf(match?.[1]?.slice(0, 3) ?? '')
  if (!match || month === -1) return undefined
  const day = Number(match[2])
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let year = match[3] ? Number(match[3]) : now.getFullYear()
  if (!match[3] && new Date(year, month, day) > today) year -= 1
  const date = new Date(year, month, day)
  return date.getMonth() === month ? isoDay(date) : undefined
}

const DAY_MS = 86_400_000

/** The heading a kept `watchedOn` day shows under, counted from `now` as the History page counts it. */
export const dayHeading = (watchedOn: string, now: Date) => {
  const [year = 0, month = 1, day = 1] = watchedOn.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - date.getTime()) / DAY_MS)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days > 1 && days < 7) return date.toLocaleDateString('en', { weekday: 'long' })
  return date.toLocaleDateString('en', year === now.getFullYear()
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}

const entryOf = (video: SourceVideo, watchedOn: string | undefined, heading: string | undefined): HistoryEntry => ({
  id: video.id,
  title: video.title,
  thumbnail: video.thumbnail,
  durationSeconds: video.durationSeconds,
  progressPercent: video.progressPercent,
  isLive: video.isLive,
  isShort: video.isShort,
  channel: video.channel && { id: video.channel.id, name: video.channel.name },
  ...(watchedOn ? { watchedOn } : heading ? { heading } : {}),
})

const collect = async (first: HistoryPage, now: Date, onProgress?: (count: number) => void) => {
  const entries: HistoryEntry[] = []
  const seen = new Set<string>()
  let page = first
  for (let pages = 1; ; pages++) {
    for (const section of page.sections ?? []) {
      const title = section.header?.title?.toString()
      const heading = title && title !== 'N/A' ? title : undefined
      const watchedOn = dayOf(heading, now)
      for (const node of section.contents ?? []) {
        const video = normalizeFeedVideo(node) ?? normalizeLockupVideo(node)
        if (!video || seen.has(video.id)) continue
        seen.add(video.id)
        entries.push(entryOf(video, watchedOn, heading))
      }
    }
    onProgress?.(entries.length)
    if (!page.has_continuation || pages >= MAX_PAGES) return entries
    page = await page.getContinuation()
  }
}

const signedOut = (data: unknown) =>
  (data as { responseContext?: { mainAppWebResponseContext?: { loggedOut?: boolean } } } | undefined)
    ?.responseContext?.mainAppWebResponseContext?.loggedOut === true

/**
 * Reads the whole watch history of the YouTube account signed in on this browser (its default account), read only:
 * one Network ask on www.youtube.com, the session's SAPISID, then YouTube's own FEhistory feed page by page through
 * the browser's cookies. Throws a `HistoryImportError` when access is declined or the browser is signed out.
 */
export const readBrowserHistory = async (
  session: BrowserSession,
  { now = new Date(), onProgress }: { now?: Date, onProgress?: (count: number) => void } = {},
): Promise<ImportedHistory> => {
  const sapisid = await readSapisid(session, IMPORT_REASON)
  if (!sapisid) throw new SignedOutError()
  const { Innertube, YT } = await import('youtubei.js/web')
  const client = await Innertube.create({
    fetch: sessionFetch(session),
    cookie: `SAPISID=${sapisid}`,
    generate_session_locally: true,
    retrieve_innertube_config: false,
    retrieve_player: false,
    lang: 'en',
    user_agent: navigator.userAgent,
  })
  client.session.context.client.clientVersion = WEB_CLIENT_VERSION
  const response = await client.actions.execute('/browse', { browseId: 'FEhistory' })
  if (signedOut(response.data)) throw new SignedOutError()
  const entries = await collect(new YT.History(client.actions, response) as unknown as HistoryPage, now, onProgress)
  return { importedAt: now.getTime(), session: await sessionOf(sapisid), entries }
}

/** Reads the browser account's history and replaces the kept copy with it; a signed out browser deletes the copy. */
export const importBrowserHistory = async (session: BrowserSession, onProgress?: (count: number) => void) => {
  const history = await readBrowserHistory(session, { onProgress }).catch(async (error: unknown) => {
    if (error instanceof SignedOutError) await deleteImportedHistory()
    throw error
  })
  await saveImportedHistory(history)
  return history
}

/**
 * `kept` when the browser is still signed in to the YouTube session it was read through. A copy of any other
 * session, or of none, is deleted and answers undefined. Throws when the session cannot be read.
 */
export const keptBrowserHistory = async (session: BrowserSession, kept: ImportedHistory) => {
  const sapisid = await readSapisid(session, SHOW_REASON)
  if (sapisid && kept.session === await sessionOf(sapisid)) return kept
  await deleteImportedHistory()
  return undefined
}

/**
 * A watch page's attestation challenge and the `ytcfg` it was issued with, which BotGuard reads as
 * `yt.config_` (its `EVENT_ID` among it). The two are only used together. Measured on an enforced
 * video: sessions on att/get's challenge with no `yt.config_` stopped at the preview limit 10 of 10
 * times signed out (2026-10-10) and 40 of 40 signed in (2026-10-13); sessions on the page's played
 * through 10 of 10 and 39 of 39.
 */
export type PageChallenge = {
  config: Record<string, unknown>
  program: string
  globalName: string
  interpreterUrl: string
}

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' }

// a single-quoted JS string literal from its opening quote, or undefined until its closing quote has arrived
const readQuoted = (text: string, open: number) => {
  const parts: string[] = []
  let from = open + 1
  for (let index = from; index < text.length; index += 1) {
    const character = text[index]
    if (character === '\'') {
      parts.push(text.slice(from, index))
      return parts.join('')
    }
    if (character !== '\\') continue
    parts.push(text.slice(from, index))
    const kind = text[index + 1] ?? ''
    if (kind === 'x' || kind === 'u') {
      const width = kind === 'x' ? 2 : 4
      parts.push(String.fromCharCode(parseInt(text.slice(index + 2, index + 2 + width), 16)))
      index += 1 + width
    } else {
      parts.push(ESCAPES[kind] ?? kind)
      index += 1
    }
    from = index + 1
  }
  return undefined
}

/** The JSON object whose opening brace is at `open`, or undefined until its closing brace has arrived. */
export const readJsonObject = (text: string, open: number) => {
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = open; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
    } else if (character === '"') quoted = true
    else if (character === '{') depth += 1
    else if (character === '}' && --depth === 0) return JSON.parse(text.slice(open, index + 1)) as Record<string, unknown>
  }
  return undefined
}

const readPlayerResponse = (html: string) => {
  const marker = html.indexOf('ytInitialPlayerResponse')
  if (marker < 0) return undefined
  const start = html.indexOf('{', marker)
  return start < 0 ? undefined : readJsonObject(html, start)
}

/**
 * The challenge and config of a watch page once both are in `html`, undefined until then. The page
 * carries the challenge as `window.ytAtN({'R': '<the att/get answer, as a JS string>'})`, after
 * `ytInitialPlayerResponse`, and its config as its first `ytcfg.set({...})`. Throws on a page whose
 * challenge is incomplete, or that carries no complete ytcfg.
 */
export const readPageChallenge = (html: string): PageChallenge | undefined => {
  const call = html.indexOf('window.ytAtN({')
  if (call < 0) return undefined
  const key = /'R'\s*:\s*'/g
  key.lastIndex = call
  const found = key.exec(html)
  if (!found) return undefined
  const raw = readQuoted(html, found.index + found[0].length - 1)
  if (raw === undefined) return undefined
  const challenge = (JSON.parse(raw) as {
    bgChallenge?: { program?: string, globalName?: string, interpreterUrl?: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string } }
  }).bgChallenge
  const interpreterUrl = challenge?.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue
  if (!challenge?.program || !challenge.globalName || !interpreterUrl) throw new Error('youtube: the watch page\'s challenge is incomplete')
  const set = html.indexOf('ytcfg.set({')
  if (set < 0) throw new Error('youtube: the watch page carries no ytcfg')
  const config = readJsonObject(html, set + 'ytcfg.set('.length)
  if (!config) throw new Error('youtube: the watch page\'s ytcfg is incomplete')
  return {
    config,
    program: challenge.program,
    globalName: challenge.globalName,
    interpreterUrl: interpreterUrl.startsWith('//') ? `https:${interpreterUrl}` : interpreterUrl,
  }
}

// the player response is answered as soon as it arrives; the read goes on to the challenge, about 78 KB further on a 1.58 MB page
const readWatchPage = (videoId: string) => {
  const playerResponse = Promise.withResolvers<Record<string, unknown>>()
  const challenge = Promise.withResolvers<PageChallenge>()
  void (async () => {
    const response = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`)
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let html = reader ? '' : await response.text()
    let player: Record<string, unknown> | undefined
    for (;;) {
      const chunk = reader ? await reader.read() : { done: true as const }
      html += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true })
      if (!player) {
        player = readPlayerResponse(html)
        if (player) playerResponse.resolve(player)
      }
      const page = player && readPageChallenge(html)
      if (page) {
        challenge.resolve(page)
        void reader?.cancel().catch(() => {})
        return
      }
      if (chunk.done) throw new Error(player ? 'youtube: the watch page carries no challenge' : 'youtube: player response is missing')
    }
  })().catch((error: unknown) => {
    playerResponse.reject(error)
    challenge.reject(error)
  })
  void playerResponse.promise.catch(() => {})
  void challenge.promise.catch(() => {})
  return { playerResponse: playerResponse.promise, challenge: challenge.promise }
}

let lastVideoId: string | undefined
let unusedChallenge: Promise<PageChallenge> | undefined
const firstRead = Promise.withResolvers<void>()

/** A watch page's player response. The page's challenge is kept for the next BotGuard session (`takePageChallenge`). */
export const fetchPlayerResponse = (videoId: string) => {
  const page = readWatchPage(videoId)
  lastVideoId = videoId
  unusedChallenge = page.challenge
  firstRead.resolve()
  return page.playerResponse
}

/**
 * The challenge for a new BotGuard session: the last page read when no session took it yet, else a
 * new read of the last video's page. Before any watch page was read, it waits for the first.
 */
export const takePageChallenge = async () => {
  await firstRead.promise
  const challenge = unusedChallenge ?? readWatchPage(lastVideoId!).challenge
  unusedChallenge = undefined
  return challenge
}

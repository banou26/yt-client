import type { IntegrityTokenData, WebPoSignalOutput } from 'bgutils-js'

import type { AgentApi } from '../engine/agent-protocol'

import { BG, buildURL, GOOG_API_KEY } from 'bgutils-js'

import { engineAgent, reportEngine } from './agent'
import { egressFetch } from './egress'
import { takePageChallenge } from './watch-page'

// attestation MUST use the egress path, not the scramjet-trapped global fetch, whose fingerprint is refused
const attestFetch = (url: string, init?: { method?: string, headers?: Record<string, string>, body?: string }) =>
  egressFetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.headers,
    body: init?.body ? (new TextEncoder().encode(init.body).buffer as ArrayBuffer) : null,
    redirect: 'follow',
  })

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo'
const TOKEN_STORE_KEY = 'yt-client:po-tokens'

// the agent's sessions answer these three through its port (createAgentSession), this realm's are bgutils' own
type MinterSession = {
  client: { shutdown(): Promise<unknown> }
  minter: { mintAsWebsafeString(identifier: string): Promise<string> }
  script: { remove(): void }
  expiresAt: number
  agent?: true
}

type StoredToken = {
  token: string
  expiresAt: number
}

let session: MinterSession | undefined
let pending: Promise<MinterSession> | undefined

const readStoredTokens = (): Record<string, StoredToken> => {
  try {
    const raw = localStorage.getItem(TOKEN_STORE_KEY)
    return raw ? JSON.parse(raw) as Record<string, StoredToken> : {}
  } catch {
    return {}
  }
}

const storeToken = (identifier: string, token: string, expiresAt: number) => {
  try {
    const tokens = readStoredTokens()
    for (const [key, value] of Object.entries(tokens)) {
      if (value.expiresAt <= Date.now()) delete tokens[key]
    }
    tokens[identifier] = { token, expiresAt }
    localStorage.setItem(TOKEN_STORE_KEY, JSON.stringify(tokens))
  } catch {}
}

const readStoredToken = (identifier: string) => {
  const stored = readStoredTokens()[identifier]
  return stored && stored.expiresAt > Date.now() ? stored.token : undefined
}

export const clearStoredTokens = () => {
  try {
    localStorage.removeItem(TOKEN_STORE_KEY)
  } catch {}
}

// the egress path bypasses Scramjet, so nothing adds these, and Innertube answers a POST with no Origin with a 403
const YOUTUBE_ORIGIN_HEADERS = {
  origin: 'https://www.youtube.com',
  referer: 'https://www.youtube.com/',
} as const

const fetchChallenge = async () => {
  const page = await takePageChallenge()
  const interpreter = await attestFetch(page.interpreterUrl).then((result) => result.text())
  return { ...page, interpreter }
}

type Challenge = Awaited<ReturnType<typeof fetchChallenge>>

// what the agent's own calls throw, the one failure that moves a session to this realm's VM: a refused challenge or GenerateIT would refuse that VM too
class AgentFailure extends Error {}

const stage = async <T>(name: string, run: () => Promise<T>, Failure: new (message: string, options: ErrorOptions) => Error = Error): Promise<T> => {
  try {
    return await run()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Failure(`botguard: ${name} failed: ${reason}`, { cause: error })
  }
}

const createSession = async (challenge: Challenge): Promise<MinterSession> => {
  const { client, script } = await stage('interpreter', async () => {
    ;(globalThis as { yt?: unknown }).yt = { config_: challenge.config }
    const element = document.createElement('script')
    element.textContent = challenge.interpreter
    document.head.appendChild(element)
    if (!(challenge.globalName in globalThis)) {
      element.remove()
      throw new Error(`the interpreter did not define ${challenge.globalName} (script evaluated but its global is absent)`)
    }
    return {
      client: await BG.BotGuardClient.create({
        globalObj: globalThis,
        globalName: challenge.globalName,
        program: challenge.program,
      }),
      script: element,
    }
  })
  const webPoSignalOutput: WebPoSignalOutput = []
  const botguardResponse = await stage('snapshot', () => client.snapshot({ webPoSignalOutput }))
  const token = await generateIntegrityToken(botguardResponse)
  return {
    client,
    minter: await BG.WebPoMinter.create(token, webPoSignalOutput),
    script,
    expiresAt: performance.now() + (token.estimatedTtlSecs ?? 3_600) * 800,
  }
}

const generateIntegrityToken = async (botguardResponse: string) => {
  const integrity = await stage('GenerateIT', async () => {
    const response = await attestFetch(buildURL('GenerateIT', true), {
      method: 'POST',
      headers: {
        ...YOUTUBE_ORIGIN_HEADERS,
        'content-type': 'application/json+protobuf',
        'x-goog-api-key': GOOG_API_KEY,
        'x-user-agent': 'grpc-web-javascript/0.1',
      },
      body: JSON.stringify([REQUEST_KEY, botguardResponse]),
    })
    if (!response.ok) throw new Error(`returned ${response.status}`)
    return await response.json() as [string | null, number, number | null, string]
  })
  const token = {
    integrityToken: integrity[0] ?? undefined,
    estimatedTtlSecs: integrity[1],
    mintRefreshThreshold: integrity[2] ?? undefined,
    websafeFallbackToken: integrity[3],
  } satisfies IntegrityTokenData
  if (!token.integrityToken && !token.websafeFallbackToken) throw new Error('botguard: integrity token is missing')
  return token
}

// the VM runs in the engine page's agent, while the challenge, GenerateIT and the token's lifetime stay here
const createAgentSession = async (challenge: Challenge, agent: AgentApi): Promise<MinterSession> => {
  const id = await stage('agent interpreter', () => agent.create({
    interpreter: challenge.interpreter,
    program: challenge.program,
    globalName: challenge.globalName,
    config: challenge.config,
  }), AgentFailure)
  try {
    const botguardResponse = await stage('agent snapshot', () => agent.snapshot(id), AgentFailure)
    const token = await generateIntegrityToken(botguardResponse)
    await stage('agent minter', () => agent.minter(id, token), AgentFailure)
    return {
      client: { shutdown: () => agent.shutdown(id) },
      minter: { mintAsWebsafeString: (identifier) => agent.mint(id, identifier) },
      script: { remove: () => {} },
      expiresAt: performance.now() + (token.estimatedTtlSecs ?? 3_600) * 800,
      agent: true,
    }
  } catch (error) {
    void agent.shutdown(id).catch(() => {})
    throw error
  }
}

const reportedAgentFailures = new Set<string>()

const reportAgentFailure = (error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error)
  if (reportedAgentFailures.has(reason)) return
  reportedAgentFailures.add(reason)
  console.warn(`yt-client: the BotGuard engine page failed, so this session's VM runs in the Scramjet frame: ${reason}`)
}

// any refusal, timeout or detach of the agent lands on this realm's own VM, the path every flag-off session takes, with the same challenge
const newSession = async (viaAgent: boolean) => {
  const agent = viaAgent ? engineAgent() : undefined
  const challenge = await stage('challenge', fetchChallenge)
  if (agent) {
    try {
      const next = await createAgentSession(challenge, agent)
      reportEngine({ engine: 'agent' })
      return next
    } catch (error) {
      if (!(error instanceof AgentFailure)) throw error
      reportAgentFailure(error)
    }
  }
  const next = await createSession(challenge)
  reportEngine({ engine: 'scramjet' })
  return next
}

const reported = new Set<string>()

const reportSessionFailure = (error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error)
  if (reported.has(reason)) return
  reported.add(reason)
  console.error(
    `yt-client: botguard session failed, falling back to cold-start tokens (playback will stop at the preview limit): ${reason}`,
    error,
  )
}

const getSession = (viaAgent = true) => {
  if (session && performance.now() < session.expiresAt) return Promise.resolve(session)
  pending ??= newSession(viaAgent).then(
    (next) => {
      session = next
      pending = undefined
      reported.clear()
      return next
    },
    (error: unknown) => {
      pending = undefined
      reportSessionFailure(error)
      throw error
    },
  )
  return pending
}

// cap on a persisted token's own ttl, as insurance against a server-side invalidation we cannot observe
const PERSISTED_TOKEN_MAX_MS = 6 * 3_600_000

const mintSessionToken = async (target: MinterSession, identifier: string) => {
  const token = await target.minter.mintAsWebsafeString(identifier)
  const remaining = Math.max(0, target.expiresAt - performance.now())
  storeToken(identifier, token, Date.now() + Math.min(remaining, PERSISTED_TOKEN_MAX_MS))
  return token
}

// an agent session whose mint fails is dropped and answers undefined, so the caller goes on to a stored token or a new session; this realm's sessions throw as before
const mintLive = async (target: MinterSession, identifier: string) => {
  try {
    const token = await mintSessionToken(target, identifier)
    reportEngine({ mint: 'session' })
    return token
  } catch (error) {
    if (!target.agent) throw error
    if (session === target) session = undefined
    void target.client.shutdown().catch(() => {})
    reportAgentFailure(error)
    return undefined
  }
}

const REFRESH_MARGIN_MS = 30 * 60_000

export const warmPoTokenSession = (identifier: string) => {
  if (session && performance.now() < session.expiresAt) return
  const stored = readStoredTokens()[identifier]
  if (stored && stored.expiresAt - Date.now() > REFRESH_MARGIN_MS) return
  void getSession().catch(() => {})
}

const SESSION_WAIT_MS = 10_000

// a session one mint already waited SESSION_WAIT_MS for is not waited on again until it settles: measured
// 2026-10-16, one whose interpreter fetch died with fkn.app's data plane worker cost every mint its 10 s
let waitedOut: Promise<MinterSession> | undefined

const sessionWithin = async (viaAgent: boolean, waitOver: Promise<undefined>) => {
  const next = getSession(viaAgent)
  if (next === waitedOut) return undefined
  const live = await Promise.race([next.catch(() => undefined), waitOver])
  if (live === undefined && next === pending) waitedOut = next
  return live
}

export const mintPoToken = async (identifier: string) => {
  if (session && performance.now() < session.expiresAt) {
    const minted = await mintLive(session, identifier)
    if (minted !== undefined) return minted
  }
  const stored = readStoredToken(identifier)
  if (stored) {
    reportEngine({ mint: 'stored' })
    warmPoTokenSession(identifier)
    return stored
  }
  // MUST wait rather than start cold: SABR fixes attestation state from a stream's first request, for its whole life
  const waitOver = new Promise<undefined>((resolve) => { setTimeout(() => resolve(undefined), SESSION_WAIT_MS) })
  const live = await sessionWithin(true, waitOver)
  if (live) {
    const minted = await mintLive(live, identifier)
    if (minted !== undefined) return minted
    // only an agent session answers undefined: its first mint failed, so this realm's own VM gets the rest of the wait
    const own = await sessionWithin(false, waitOver)
    const retried = own && await mintLive(own, identifier)
    if (retried !== undefined) return retried
  }
  reportEngine({ mint: 'cold' })
  return BG.PoToken.generateColdStartToken(identifier)
}

export const recoverPoTokenSession = async () => {
  clearStoredTokens()
  if (pending) {
    await pending.catch(() => {})
    return
  }
  await resetPoTokenSession()
  await getSession()
}

export const resetPoTokenSession = async () => {
  if (!session) return
  const current = session
  session = undefined
  current.script.remove()
  await current.client.shutdown().catch(() => {})
}

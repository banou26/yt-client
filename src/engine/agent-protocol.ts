import type { IntegrityTokenData } from 'bgutils-js'

/** The cloud blank page BotGuard's VM runs in from Y1: presented at this url, never loaded from it. */
export const AGENT_PAGE_URL = 'https://www.youtube.com/__yt_client__/frame'
export const AGENT_PAGE_ORIGIN = 'https://www.youtube.com'

/** The message the app realm posts to the page with the agent's port as its one transferred port. */
export const AGENT_INSTALL = 'yt-client:agent'

/** The name the agent's IIFE bundle binds (vite.agent.config.ts), local to the function agent-source.ts wraps it in, whose `install` the app calls after it. */
export const AGENT_GLOBAL = 'YtClientAgent'

export type AgentChallenge = {
  interpreter: string
  program: string
  globalName: string
}

/**
 * The agent's methods, each reached as a numbered request on its port. A session is the agent's
 * number for one BotGuard VM; the caller keeps the challenge, GenerateIT and the token's lifetime.
 */
export type AgentApi = {
  /** Runs the interpreter as an inline script and loads the program: `BotGuardClient.create`. */
  create(challenge: AgentChallenge): Promise<number>
  /** BotGuard's response for GenerateIT; the signal functions it fills stay with the session. */
  snapshot(session: number): Promise<string>
  /** `WebPoMinter.create` from GenerateIT's answer and the session's own signal functions. */
  minter(session: number, token: IntegrityTokenData): Promise<void>
  mint(session: number, identifier: string): Promise<string>
  shutdown(session: number): Promise<void>
}

export const AGENT_METHODS = ['create', 'snapshot', 'minter', 'mint', 'shutdown'] as const satisfies readonly (keyof AgentApi)[]

export type AgentMethod = (typeof AGENT_METHODS)[number]

const agentMethods: ReadonlySet<string> = new Set(AGENT_METHODS)

export const isAgentMethod = (value: unknown): value is AgentMethod =>
  typeof value === 'string' && agentMethods.has(value)

export type AgentRequest = {
  [Method in AgentMethod]: { id: number, method: Method, args: Parameters<AgentApi[Method]> }
}[AgentMethod]

export type AgentResponse = { id: number, result: unknown, error?: never } | { id: number, result?: never, error: string }

/** What the frame posts on the bridge when it stops waiting for call `id`, so a call still queued for the engine page never runs. */
export type AgentCancel = { type: 'cancel', id: number }

/** Messages on an agent port that are not answers: `ready` once the agent holds the port, the heartbeat's `ping` and `pong`. */
export type AgentControl = { type: 'ready' } | { type: 'ping' } | { type: 'pong' }

export const MINT_KINDS = ['session', 'stored', 'cold'] as const
export const ENGINES = ['agent', 'scramjet'] as const

/**
 * What the frame tells the app realm over the bridge, published on `<html>` as `data-yt-mint` and
 * `data-yt-engine`: the last mint's kind, and which VM built the session in use.
 */
export type EngineReport = {
  type: 'report'
  mint?: (typeof MINT_KINDS)[number]
  engine?: (typeof ENGINES)[number]
}

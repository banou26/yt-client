import type { AgentApi, AgentControl, AgentRequest, AgentResponse } from './agent-protocol'

import { BG } from 'bgutils-js'
import type { WebPoSignalOutput } from 'bgutils-js'

import { AGENT_INSTALL, isAgentMethod } from './agent-protocol'

/** The page as the agent needs it: where the app's message arrives, and the global the interpreter defines. */
export type AgentScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
}

export type AgentOptions = {
  scope: AgentScope
  /** The only origin a port is taken from: the app's, which the page sees as `event.origin`. */
  appOrigin: string
  /** Runs an inline script in the page and answers how to remove it. */
  runScript: (source: string) => () => void
}

const AGENT_MARK = '__ytClientAgent'

type Session = {
  client: InstanceType<typeof BG.BotGuardClient>
  signals: WebPoSignalOutput
  minter?: InstanceType<typeof BG.WebPoMinter>
  removeScript(): void
}

/**
 * Installs BotGuard's VM half in a page: a listener that takes one port from the app's origin and
 * answers `AgentApi` on it. Idempotent, since the page's `document` event can fire twice for one
 * document: a second call answers 'already' and adds nothing. A new port replaces the previous one
 * and shuts down every session made through it.
 */
export const installAgent = ({ scope, appOrigin, runScript }: AgentOptions): 'installed' | 'already' => {
  const global = scope as unknown as Record<string, unknown>
  if (global[AGENT_MARK]) return 'already'
  global[AGENT_MARK] = true

  const sessions = new Map<number, Session>()
  let lastSession = 0
  let port: MessagePort | undefined

  const sessionOf = (id: number) => {
    const session = sessions.get(id)
    if (!session) throw new Error(`yt-client agent: no session ${id}`)
    return session
  }

  const methods: AgentApi = {
    create: async ({ interpreter, program, globalName }) => {
      const removeScript = runScript(interpreter)
      if (!(globalName in global)) {
        removeScript()
        throw new Error(`the interpreter did not define ${globalName} (script evaluated but its global is absent)`)
      }
      const client = await BG.BotGuardClient.create({ globalObj: global, globalName, program }).catch((error: unknown) => {
        removeScript()
        throw error
      })
      const id = ++lastSession
      sessions.set(id, { client, signals: [], removeScript })
      return id
    },
    snapshot: async (id) => {
      const session = sessionOf(id)
      return session.client.snapshot({ webPoSignalOutput: session.signals })
    },
    minter: async (id, token) => {
      const session = sessionOf(id)
      session.minter = await BG.WebPoMinter.create(token, session.signals)
    },
    mint: async (id, identifier) => {
      const { minter } = sessionOf(id)
      if (!minter) throw new Error(`yt-client agent: session ${id} has no minter yet`)
      return minter.mintAsWebsafeString(identifier)
    },
    shutdown: async (id) => {
      const session = sessions.get(id)
      if (!session) return
      sessions.delete(id)
      session.removeScript()
      await session.client.shutdown().catch(() => {})
    },
  }

  const answer = async (target: MessagePort, request: AgentRequest | AgentControl) => {
    if ('type' in request) {
      if (request.type === 'ping') target.postMessage({ type: 'pong' } satisfies AgentControl)
      return
    }
    if (typeof request.id !== 'number') return
    if (!isAgentMethod(request.method)) {
      target.postMessage({ id: request.id, error: `yt-client agent: unknown method "${String(request.method)}"` } satisfies AgentResponse)
      return
    }
    try {
      const result = await (methods[request.method] as (...args: unknown[]) => Promise<unknown>)(...request.args)
      target.postMessage({ id: request.id, result } satisfies AgentResponse)
    } catch (error) {
      target.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) } satisfies AgentResponse)
    }
  }

  const take = (next: MessagePort) => {
    port?.close()
    for (const id of sessions.keys()) void methods.shutdown(id)
    port = next
    next.addEventListener('message', (event) => {
      if (event.data && typeof event.data === 'object') void answer(next, event.data as AgentRequest | AgentControl)
    })
    next.start()
    next.postMessage({ type: 'ready' } satisfies AgentControl)
  }

  scope.addEventListener('message', (event) => {
    if (event.origin !== appOrigin) return
    if ((event.data as { type?: unknown } | null)?.type !== AGENT_INSTALL) return
    const [next, ...extra] = event.ports
    if (!next || extra.length) return
    take(next)
  })
  return 'installed'
}

/** The page's own binding, which the IIFE bundle exposes as `YtClientAgent.install`. */
export const install = (appOrigin: string) => installAgent({
  scope: window,
  appOrigin,
  runScript: (source) => {
    const element = document.createElement('script')
    element.textContent = source
    document.head.appendChild(element)
    return () => element.remove()
  },
})

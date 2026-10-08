import type { AgentControl, AgentRequest, AgentResponse, EngineReport } from './agent-protocol'

import { startPlatform } from '../scramjet/platform'
import { AGENT_INSTALL, AGENT_PAGE_ORIGIN, AGENT_PAGE_URL, ENGINES, MINT_KINDS } from './agent-protocol'

/** What the host needs of an attached engine page: the part of `@fkn/lib`'s `Frame` it calls. */
export type AgentFrame = {
  addScriptTag(options: { content: string, sourceUrl?: string }): Promise<void>
  postMessage(message: unknown, options: { targetOrigin: string, transfer: Transferable[] }): Promise<void>
  on(type: 'document', listener: () => void): void
}

export type AgentHostOptions = {
  /** Mounts a fresh frame and attaches the engine page in it; `detach` removes it. */
  attach: () => Promise<{ frame: AgentFrame, detach: () => void }>
  /** The agent bundle with its install call, as one classic script. */
  source: () => Promise<string>
  publish: (name: 'ytMint' | 'ytEngine', value: string) => void
}

/** The answer to every bridged call while the engine page cannot be had, so the frame falls back at once. */
export const AGENT_UNAVAILABLE = 'yt-client agent: the engine page is unavailable'
/** The answer to a call in flight when its page was replaced (a new document, a missed heartbeat). */
export const AGENT_REPLACED = 'yt-client agent: the engine page was replaced during the call'

const HEARTBEAT_MS = 5_000
const SILENCE_MS = 15_000
const INSTALL_TIMEOUT_MS = 5_000
const AGENT_SOURCE_URL = 'yt-client-botguard-agent.js'

const waitForReady = (port: MessagePort) => new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('yt-client agent: the agent never took its port')), INSTALL_TIMEOUT_MS)
  port.addEventListener('message', (event) => {
    if ((event.data as AgentControl | undefined)?.type !== 'ready') return
    clearTimeout(timeout)
    resolve()
  })
  port.start()
})

const isReport = (message: unknown): message is EngineReport =>
  (message as EngineReport | null)?.type === 'report'

/**
 * The app realm's side of the engine page. One attachment per app realm, kept across engine
 * resets; each engine generation gets a bridge, whose frame end goes in `HOST_BOOTSTRAP`, and the
 * host relays it to whichever agent port is current. A `document` event installs the agent again
 * on the same attachment, and 15000 ms with nothing heard from the agent (pinged every 5000 ms)
 * attaches again. While the page is attaching a call waits; once an attach or install has failed
 * every call is answered `AGENT_UNAVAILABLE`, for the frame to fall back to its own VM.
 */
export const createAgentHost = ({ attach, source, publish }: AgentHostOptions) => {
  let state: 'attaching' | 'ready' | 'failed' = 'attaching'
  let generation = 0
  let attachment: Awaited<ReturnType<AgentHostOptions['attach']>> | undefined
  let agent: MessagePort | undefined
  let bridge: MessagePort | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let lastHeard = 0
  const queued: AgentRequest[] = []
  const inFlight = new Set<number>()

  const answerBridge = (id: number, error: string) => bridge?.postMessage({ id, error } satisfies AgentResponse)

  const dropAgent = () => {
    clearInterval(heartbeat)
    heartbeat = undefined
    agent?.close()
    agent = undefined
    for (const id of inFlight) answerBridge(id, AGENT_REPLACED)
    inFlight.clear()
  }

  const fail = (error: unknown) => {
    dropAgent()
    state = 'failed'
    for (const request of queued.splice(0)) answerBridge(request.id, AGENT_UNAVAILABLE)
    console.warn('[yt-client] the BotGuard engine page is unavailable, so BotGuard runs in the Scramjet frame:', error instanceof Error ? error.message : String(error))
  }

  const send = (request: AgentRequest) => {
    if (state === 'failed') answerBridge(request.id, AGENT_UNAVAILABLE)
    else if (!agent) queued.push(request)
    else {
      inFlight.add(request.id)
      agent.postMessage(request)
    }
  }

  const take = (port: MessagePort) => {
    agent = port
    state = 'ready'
    lastHeard = Date.now()
    port.addEventListener('message', (event) => {
      lastHeard = Date.now()
      const message = event.data as AgentResponse | AgentControl
      if ('id' in message && inFlight.delete(message.id)) bridge?.postMessage(message)
    })
    heartbeat = setInterval(() => {
      if (Date.now() - lastHeard >= SILENCE_MS) void attachAgain()
      else port.postMessage({ type: 'ping' } satisfies AgentControl)
    }, HEARTBEAT_MS)
    for (const request of queued.splice(0)) send(request)
  }

  const install = async (frame: AgentFrame) => {
    const current = ++generation
    dropAgent()
    state = 'attaching'
    const channel = new MessageChannel()
    try {
      await frame.addScriptTag({ content: await source(), sourceUrl: AGENT_SOURCE_URL })
      const ready = waitForReady(channel.port1)
      // a failed postMessage leaves this wait to time out on its own, after the catch below has run
      ready.catch(() => {})
      await frame.postMessage({ type: AGENT_INSTALL }, { targetOrigin: AGENT_PAGE_ORIGIN, transfer: [channel.port2] })
      await ready
      if (current !== generation) {
        channel.port1.close()
        return
      }
      take(channel.port1)
    } catch (error) {
      channel.port1.close()
      if (current === generation) fail(error)
    }
  }

  const attachAgain = async () => {
    const current = ++generation
    dropAgent()
    attachment?.detach()
    attachment = undefined
    state = 'attaching'
    try {
      const next = await attach()
      if (current !== generation) {
        next.detach()
        return
      }
      attachment = next
      next.frame.on('document', () => { if (attachment === next) void install(next.frame) })
      await install(next.frame)
    } catch (error) {
      if (current === generation) fail(error)
    }
  }

  const relay = (message: unknown) => {
    if (isReport(message)) {
      if (message.engine && ENGINES.includes(message.engine)) publish('ytEngine', message.engine)
      if (message.mint && MINT_KINDS.includes(message.mint)) publish('ytMint', message.mint)
      return
    }
    const request = message as AgentRequest
    if (typeof request?.id === 'number') send(request)
  }

  /** A new bridge for a new engine generation: the previous one closes, and a live agent takes a fresh port. */
  const openBridge = () => {
    const previous = bridge
    previous?.close()
    // the previous generation's calls are cleared before the switch, so none is answered on the new bridge, whose ids start over
    queued.length = 0
    inFlight.clear()
    const channel = new MessageChannel()
    bridge = channel.port1
    channel.port1.addEventListener('message', (event) => relay(event.data))
    channel.port1.start()
    if (previous && state === 'ready' && attachment) void install(attachment.frame)
    return channel.port2
  }

  void attachAgain()
  return { openBridge }
}

let host: ReturnType<typeof createAgentHost> | undefined

// rendered rather than display: none, as the brief has it; whether an off screen cross-origin frame's timers slow is measured at Y1
const ENGINE_FRAME_STYLE = 'position: fixed; left: -10px; top: -10px; width: 1px; height: 1px; border: 0; pointer-events: none;'

const attachEnginePage = async () => {
  await startPlatform()
  // the platform mounted the broker before its own import of the lib, so this import adds no second one
  const { attachFrame } = await import('@fkn/lib')
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.tabIndex = -1
  iframe.style.cssText = ENGINE_FRAME_STYLE
  document.body.appendChild(iframe)
  try {
    const frame = await attachFrame({ iframe, blank: { url: AGENT_PAGE_URL }, cookies: 'ephemeral' })
    return { frame, detach: () => iframe.remove() }
  } catch (error) {
    iframe.remove()
    throw error
  }
}

/** Starts attaching the engine page, once per app realm. Behind `yt-client:step:y1` (`step-flag.ts`). */
export const startAgentHost = () => (host ??= createAgentHost({
  attach: attachEnginePage,
  source: () => import('./agent-source').then(({ agentSource }) => agentSource(location.origin)),
  publish: (name, value) => { document.documentElement.dataset[name] = value },
}))

/** The frame end of a new bridge to the agent, for the engine generation booting now. */
export const openAgentBridge = () => startAgentHost().openBridge()

import type { AgentApi, AgentCancel, AgentMethod, AgentResponse, EngineReport } from '../engine/agent-protocol'

import { AGENT_METHODS } from '../engine/agent-protocol'
import { FRAME_AGENT_CONNECT } from './protocol'

type FrameWindow = Window & {
  [FRAME_AGENT_CONNECT]?: (port: MessagePort) => void
}

// past this a call counts as the engine page's failure, and the session is built in this realm instead; under botguard.ts's 10000 ms wait so the fallback still lands inside it
const AGENT_CALL_TIMEOUT_MS = 5_000

let port: MessagePort | undefined
let requestId = 0
const pending = new Map<number, { resolve(value: unknown): void, reject(error: Error): void }>()

const connect = (next: MessagePort) => {
  next.addEventListener('message', (event) => {
    const message = event.data as AgentResponse
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error !== undefined) request.reject(new Error(message.error))
    else request.resolve(message.result)
  })
  next.start()
  port = next
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window as FrameWindow, FRAME_AGENT_CONNECT, { configurable: true, value: connect })
}

const call = (target: MessagePort, method: AgentMethod, args: unknown[]) => new Promise<unknown>((resolve, reject) => {
  const id = ++requestId
  const timeout = setTimeout(() => {
    if (!pending.delete(id)) return
    target.postMessage({ type: 'cancel', id } satisfies AgentCancel)
    reject(new Error(`yt-client agent: ${method} timed out after ${AGENT_CALL_TIMEOUT_MS} ms`))
  }, AGENT_CALL_TIMEOUT_MS)
  pending.set(id, {
    resolve: (value) => {
      clearTimeout(timeout)
      resolve(value)
    },
    reject: (error) => {
      clearTimeout(timeout)
      reject(error)
    },
  })
  target.postMessage({ id, method, args })
})

/** The BotGuard agent in the engine page, or undefined when this engine was booted with no agent port (the step flag off). */
export const engineAgent = (): AgentApi | undefined => {
  const target = port
  if (!target) return undefined
  return Object.fromEntries(AGENT_METHODS.map((method) => [method, (...args: unknown[]) => call(target, method, args)])) as AgentApi
}

/** Tells the app realm the last mint's kind and the session's VM; nothing is sent with no agent port. */
export const reportEngine = (report: Omit<EngineReport, 'type'>) => {
  port?.postMessage({ type: 'report', ...report } satisfies EngineReport)
}

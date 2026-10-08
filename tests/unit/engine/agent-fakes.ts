import type { AgentScope } from '../../../src/engine/botguard-agent'

export const APP_ORIGIN = 'https://youtube.fkn.app'
export const INTERPRETER = 'the interpreter source'
export const GLOBAL_NAME = 'fakeBotguard'
export const PROGRAM = 'the program'
export const CHALLENGE = { interpreter: INTERPRETER, program: PROGRAM, globalName: GLOBAL_NAME }
// base64 of 'it', the integrity token GenerateIT answers in these tests
export const INTEGRITY = { integrityToken: 'aXQ=', estimatedTtlSecs: 3_600, websafeFallbackToken: 'fallback' }

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

/**
 * A stand-in for BotGuard's VM in the shape bgutils drives (`vm.a` and the four functions it hands
 * back), so the real BotGuardClient and WebPoMinter run against it. Its minter answers
 * `<label>:<integrity>:<identifier>`, so a test can tell which VM minted a token.
 */
export const fakeBotguardVm = (label: string, log: string[] = []) => ({
  a: (program: string, ready: (...functions: unknown[]) => void) => {
    log.push(`${label} load ${program}`)
    ready(
      (answer: (response: string) => void, [, , signals]: [unknown, unknown, unknown[]]) => {
        signals.push(async (integrity: Uint8Array) => async (identifier: Uint8Array) =>
          new TextEncoder().encode(`${label}:${text(integrity)}:${text(identifier)}`))
        answer(`${label} snapshot of ${program}`)
      },
      () => { log.push(`${label} shutdown`) },
      () => {},
      () => {},
    )
    return [async () => `${label} sync snapshot`]
  },
})

/** The websafe token `fakeBotguardVm(label)` mints for `identifier` with INTEGRITY. */
export const mintedBy = (label: string, identifier: string) =>
  Buffer.from(`${label}:it:${identifier}`).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')

/** A blank page as the agent sees it: a message target, a global, and inline scripts it can run and remove. */
export const fakeAgentPage = (label = 'agent') => {
  const listeners = new Set<(event: MessageEvent) => void>()
  const log: string[] = []
  const scripts: string[] = []
  let removedScripts = 0
  const scope: AgentScope & Record<string, unknown> = {
    addEventListener: (_type: 'message', listener: (event: MessageEvent) => void) => { listeners.add(listener) },
  }
  const runScript = (source: string) => {
    scripts.push(source)
    if (source === INTERPRETER) scope[GLOBAL_NAME] = fakeBotguardVm(label, log)
    return () => { removedScripts++ }
  }
  const deliver = (event: { origin: string, data: unknown, ports?: MessagePort[] }) => {
    for (const listener of listeners) listener({ ports: [], ...event } as unknown as MessageEvent)
  }
  return { scope, runScript, deliver, listeners, log, scripts, removed: () => removedScripts }
}

type Answer = { id: number, result?: unknown, error?: string }

/** The calling end of an agent port: numbered calls, and the control messages (`ready`, `pong`) kept in order. */
export const agentClient = (port: MessagePort) => {
  let requestId = 0
  const pending = new Map<number, (answer: Answer) => void>()
  const controls: { type: string }[] = []
  port.addEventListener('message', (event) => {
    const message = event.data as Answer | { type: string }
    if ('id' in message) pending.get(message.id)?.(message)
    else controls.push(message)
  })
  port.start()
  const call = (method: string, ...args: unknown[]) => new Promise<unknown>((resolve, reject) => {
    const id = ++requestId
    pending.set(id, (answer) => {
      pending.delete(id)
      if (answer.error !== undefined) reject(new Error(answer.error))
      else resolve(answer.result)
    })
    port.postMessage({ id, method, args })
  })
  return { call, controls, post: (message: unknown) => port.postMessage(message) }
}

/** Real time for MessagePort deliveries, which fake timers do not move. */
export const turn = (ms = 20) => new Promise((resolve) => { setTimeout(resolve, ms) })

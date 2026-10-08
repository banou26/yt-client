import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { AGENT_REPLACED, AGENT_UNAVAILABLE } from '../../../src/engine/agent-host'
import { FRAME_AGENT_CONNECT } from '../../../src/frame/protocol'
import { fakeBotguardVm, GLOBAL_NAME, INTERPRETER, mintedBy, PROGRAM } from '../engine/agent-fakes'

const egress = vi.hoisted(() => ({ egressFetch: vi.fn() }))
vi.mock('../../../src/frame/egress', () => egress)

const CONTEXT = { client: { visitorData: 'visitor', clientVersion: '2.20261008.00.00' } }
const INTERPRETER_URL = '//www.google.com/js/th/interpreter.js'

type Request = { id: number, method: string, args: unknown[] }
type Reply = { result?: unknown, error?: string } | undefined

const endpoint = (url: string) => {
  if (url.includes('/att/get')) return 'att/get'
  if (url.includes('interpreter.js')) return 'interpreter'
  if (url.includes('GenerateIT')) return 'GenerateIT'
  return url
}

// youtube.com and Google as the frame's egress answers them, signed out
const answerEgress = (url: string) => {
  const name = endpoint(url)
  if (name === 'att/get') {
    return new Response(JSON.stringify({
      bgChallenge: { program: PROGRAM, globalName: GLOBAL_NAME, interpreterUrl: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue: INTERPRETER_URL } },
    }))
  }
  if (name === 'interpreter') return new Response(INTERPRETER)
  if (name === 'GenerateIT') return new Response(JSON.stringify(['aXQ=', 3_600, null, 'fallback']))
  return new Response(null, { status: 404 })
}

// the Scramjet realm: a script element whose interpreter defines the VM global, as the real one does
const installRealm = () => {
  const storage = new Map<string, string>()
  const log: string[] = []
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  })
  vi.stubGlobal('document', {
    cookie: '',
    createElement: () => ({ textContent: '', remove: () => {} }),
    head: {
      appendChild: (element: { textContent: string }) => {
        if (element.textContent === INTERPRETER) (globalThis as Record<string, unknown>)[GLOBAL_NAME] = fakeBotguardVm('scramjet', log)
      },
    },
  })
  return { log }
}

// the app realm's end of the agent bridge, answering as a test case says the engine page does
const connectAgent = (answer: (request: Request) => Reply) => {
  const channel = new MessageChannel()
  const requests: string[] = []
  const reports: unknown[] = []
  const cancels: number[] = []
  channel.port2.addEventListener('message', (event) => {
    const message = event.data as Request | { type: 'report' } | { type: 'cancel', id: number }
    if ('type' in message) {
      if (message.type === 'cancel') cancels.push(message.id)
      else reports.push(message)
      return
    }
    requests.push(message.method)
    const reply = answer(message)
    if (reply) channel.port2.postMessage({ id: message.id, ...reply })
  })
  channel.port2.start()
  const connect = (window as unknown as Record<string, (port: MessagePort) => void>)[FRAME_AGENT_CONNECT]
  if (!connect) throw new Error('the frame defines no agent connector')
  connect(channel.port1)
  const reply = (id: number, answer: NonNullable<Reply>) => channel.port2.postMessage({ id, ...answer })
  return { requests, reports, cancels, reply, close: () => { channel.port1.close(); channel.port2.close() } }
}

const immediate = () => new Promise((resolve) => { setImmediate(resolve) })
const until = async (check: () => boolean) => {
  for (let tries = 0; tries < 500 && !check(); tries++) await immediate()
}

describe('minting when the FKN engine page fails', () => {
  let realm: ReturnType<typeof installRealm>
  let agent: ReturnType<typeof connectAgent> | undefined

  beforeEach(() => {
    vi.resetModules()
    egress.egressFetch.mockReset()
    egress.egressFetch.mockImplementation(async (url: string) => answerEgress(url))
    realm = installRealm()
  })

  afterEach(() => {
    agent?.close()
    agent = undefined
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete (globalThis as Record<string, unknown>)[GLOBAL_NAME]
  })

  it("with the FKN engine refused, mintPoToken still gets a live session from Scramjet's VM", async () => {
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = connectAgent(() => ({ error: AGENT_UNAVAILABLE }))
    expect(await mintPoToken('video-1', CONTEXT)).toBe(mintedBy('scramjet', 'video-1'))
    expect(agent.requests).toEqual(['create'])
    expect(realm.log).toEqual([`scramjet load ${PROGRAM}`])
    await until(() => agent!.reports.length === 2)
    expect(agent.reports).toEqual([{ type: 'report', engine: 'scramjet' }, { type: 'report', mint: 'session' }])
    // the challenge fetched for the agent is the one Scramjet's VM runs
    expect(egress.egressFetch.mock.calls.map(([url]) => endpoint(url as string))).toEqual(['att/get', 'interpreter', 'GenerateIT'])
  })

  it.each([
    ['att/get', ['att/get']],
    ['GenerateIT', ['att/get', 'interpreter', 'GenerateIT']],
  ])("a refused %s is not the engine page's failure: no second attestation and no Scramjet VM", async (refused, sent) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    egress.egressFetch.mockImplementation(async (url: string) =>
      endpoint(url) === refused ? new Response(null, { status: 403 }) : answerEgress(url))
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = connectAgent(({ method }) => {
      if (method === 'create') return { result: 7 }
      if (method === 'snapshot') return { result: 'agent snapshot' }
      return { result: undefined }
    })
    await mintPoToken('video-1', CONTEXT)
    expect(egress.egressFetch.mock.calls.map(([url]) => endpoint(url as string))).toEqual(sent)
    expect(realm.log).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it("a fresh agent session whose first mint fails is retried on Scramjet's VM, not minted cold", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = connectAgent(({ method }) => {
      if (method === 'create') return { result: 7 }
      if (method === 'snapshot') return { result: 'agent snapshot' }
      if (method === 'mint') return { error: AGENT_REPLACED }
      return { result: undefined }
    })
    expect(await mintPoToken('video-1', CONTEXT)).toBe(mintedBy('scramjet', 'video-1'))
    await until(() => agent!.reports.length === 3)
    expect(agent.reports).toEqual([
      { type: 'report', engine: 'agent' },
      { type: 'report', engine: 'scramjet' },
      { type: 'report', mint: 'session' },
    ])
    // read after the reports, which came on the same port later: no second create, so the retry never asked the agent
    expect(agent.requests).toEqual(['create', 'snapshot', 'minter', 'mint', 'shutdown'])
  })

  it("the retry on Scramjet's VM shares the session wait: 10000 ms from the call, the token is cold", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let integrityTokens = 0
    egress.egressFetch.mockImplementation(async (url: string) =>
      endpoint(url) === 'GenerateIT' && ++integrityTokens > 1 ? new Promise<never>(() => {}) : answerEgress(url))
    const { mintPoToken } = await import('../../../src/frame/botguard')
    let create = 0
    agent = connectAgent(({ id, method }) => {
      if (method === 'create') {
        create = id
        return undefined
      }
      if (method === 'snapshot') return { result: 'agent snapshot' }
      if (method === 'mint') return { error: AGENT_REPLACED }
      return { result: undefined }
    })
    let settled = false
    const token = mintPoToken('video-1', CONTEXT).finally(() => { settled = true })
    await until(() => create !== 0)
    // the agent session takes 4000 ms, under the agent's own 5000 ms call timeout
    await vi.advanceTimersByTimeAsync(4_000)
    agent.reply(create, { result: 7 })
    await until(() => integrityTokens === 2)
    await vi.advanceTimersByTimeAsync(5_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await until(() => settled)
    expect(settled).toBe(true)
    await token
    await until(() => agent!.reports.length === 2)
    // the Scramjet session is still waiting on its GenerateIT, so it reports no engine
    expect(agent.reports).toEqual([{ type: 'report', engine: 'agent' }, { type: 'report', mint: 'cold' }])
  })

  it('with no session to be had, the token is cold and the frame reports it cold', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    egress.egressFetch.mockImplementation(async (url: string) =>
      endpoint(url) === 'att/get' ? new Response(null, { status: 403 }) : answerEgress(url))
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = connectAgent(() => ({ result: undefined }))
    await mintPoToken('video-1', CONTEXT)
    await until(() => agent!.reports.length === 1)
    expect(agent.reports).toEqual([{ type: 'report', mint: 'cold' }])
    expect(agent.requests).toEqual([])
  })

  it("with the FKN engine timed out, mintPoToken still gets a live session from Scramjet's VM, inside the session wait", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = connectAgent(() => undefined)
    const token = mintPoToken('video-1', CONTEXT)
    await until(() => agent!.requests.length === 1)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await token).toBe(mintedBy('scramjet', 'video-1'))
    expect(agent.requests).toEqual(['create'])
    // the call it gave up on is cancelled, so a page still attaching never runs it
    await until(() => agent!.cancels.length === 1)
    expect(agent.cancels).toEqual([1])
  })

  it("with the FKN engine detached mid-session, mintPoToken still gets a live session from Scramjet's VM", async () => {
    let detached = false
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = connectAgent(({ method }) => {
      if (detached) return { error: method === 'mint' ? AGENT_REPLACED : AGENT_UNAVAILABLE }
      if (method === 'create') return { result: 7 }
      if (method === 'snapshot') return { result: 'agent snapshot' }
      if (method === 'mint') return { result: 'agent-token' }
      return { result: undefined }
    })
    expect(await mintPoToken('video-1', CONTEXT)).toBe('agent-token')
    expect(realm.log).toEqual([])

    detached = true
    expect(await mintPoToken('video-2', CONTEXT)).toBe(mintedBy('scramjet', 'video-2'))
    expect(agent.requests).toEqual(['create', 'snapshot', 'minter', 'mint', 'mint', 'shutdown', 'create'])
    await until(() => agent!.reports.length === 4)
    expect(agent.reports).toEqual([
      { type: 'report', engine: 'agent' },
      { type: 'report', mint: 'session' },
      { type: 'report', engine: 'scramjet' },
      { type: 'report', mint: 'session' },
    ])
  })
})

describe('minting with the flag off', () => {
  beforeEach(() => {
    vi.resetModules()
    egress.egressFetch.mockReset()
    egress.egressFetch.mockImplementation(async (url: string) => answerEgress(url))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (globalThis as Record<string, unknown>)[GLOBAL_NAME]
  })

  it("with no agent port, every session is this realm's, built exactly as before", async () => {
    const realm = installRealm()
    const { mintPoToken } = await import('../../../src/frame/botguard')
    expect(await mintPoToken('video-1', CONTEXT)).toBe(mintedBy('scramjet', 'video-1'))
    expect(egress.egressFetch.mock.calls.map(([url]) => endpoint(url as string))).toEqual(['att/get', 'interpreter', 'GenerateIT'])
    expect(realm.log).toEqual([`scramjet load ${PROGRAM}`])
    // the next mint is the same session's, with no second challenge
    expect(await mintPoToken('video-2', CONTEXT)).toBe(mintedBy('scramjet', 'video-2'))
    expect(egress.egressFetch).toHaveBeenCalledTimes(3)
  })
})

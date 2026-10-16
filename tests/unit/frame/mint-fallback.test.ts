import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { AGENT_REPLACED, AGENT_UNAVAILABLE } from '../../../src/engine/agent-host'
import { FRAME_AGENT_CONNECT } from '../../../src/frame/protocol'
import { fakeBotguardVm, GLOBAL_NAME, INTERPRETER, mintedBy, PROGRAM } from '../engine/agent-fakes'
import { streamed, watchPage } from './watch-page-fakes'

const egress = vi.hoisted(() => ({ egressFetch: vi.fn() }))
vi.mock('../../../src/frame/egress', () => egress)

type Request = { id: number, method: string, args: unknown[] }
type Reply = { result?: unknown, error?: string } | undefined

const endpoint = (url: string) => {
  if (url.includes('interpreter.js')) return 'interpreter'
  if (url.includes('GenerateIT')) return 'GenerateIT'
  return url
}

// Google as the frame's egress answers the attestation calls
const answerEgress = (url: string) => {
  const name = endpoint(url)
  if (name === 'interpreter') return new Response(INTERPRETER)
  if (name === 'GenerateIT') return new Response(JSON.stringify(['aXQ=', 3_600, null, 'fallback']))
  return new Response(null, { status: 404 })
}

// the Scramjet realm: a script element whose interpreter defines the VM global, as the real one does, and its fetch of watch pages, each with an EVENT_ID of its own
const installRealm = ({ challenge = true } = {}) => {
  const storage = new Map<string, string>()
  const log: string[] = []
  const configs: unknown[] = []
  const watched: string[] = []
  vi.stubGlobal('window', {})
  vi.stubGlobal('fetch', async (url: string) => {
    watched.push(url)
    return streamed([watchPage({ eventId: `event-${watched.length}`, challenge })])
  })
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
        if (element.textContent !== INTERPRETER) return
        configs.push((globalThis as { yt?: { config_?: unknown } }).yt?.config_)
        ;(globalThis as Record<string, unknown>)[GLOBAL_NAME] = fakeBotguardVm('scramjet', log)
      },
    },
  })
  return { log, configs, watched }
}

// the frame's read of a watch page, which offers its challenge to the next session
const readWatchPage = async (videoId = 'video-1') => {
  const { fetchPlayerResponse } = await import('../../../src/frame/watch-page')
  await fetchPlayerResponse(videoId)
}

// the app realm's end of the agent bridge, answering as a test case says the engine page does
const connectAgent = (answer: (request: Request) => Reply) => {
  const channel = new MessageChannel()
  const requests: string[] = []
  const creates: unknown[] = []
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
    if (message.method === 'create') creates.push(message.args[0])
    const reply = answer(message)
    if (reply) channel.port2.postMessage({ id: message.id, ...reply })
  })
  channel.port2.start()
  const connect = (window as unknown as Record<string, (port: MessagePort) => void>)[FRAME_AGENT_CONNECT]
  if (!connect) throw new Error('the frame defines no agent connector')
  connect(channel.port1)
  const reply = (id: number, answer: NonNullable<Reply>) => channel.port2.postMessage({ id, ...answer })
  return { requests, creates, reports, cancels, reply, close: () => { channel.port1.close(); channel.port2.close() } }
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
    delete (globalThis as Record<string, unknown>).yt
  })

  it("with the FKN engine refused, mintPoToken still gets a live session from Scramjet's VM", async () => {
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = connectAgent(() => ({ error: AGENT_UNAVAILABLE }))
    await readWatchPage()
    expect(await mintPoToken('video-1')).toBe(mintedBy('scramjet', 'video-1'))
    expect(agent.requests).toEqual(['create'])
    expect(realm.log).toEqual([`scramjet load ${PROGRAM}`])
    await until(() => agent!.reports.length === 2)
    expect(agent.reports).toEqual([{ type: 'report', engine: 'scramjet' }, { type: 'report', mint: 'session' }])
    // the challenge taken for the agent is the one Scramjet's VM runs, with the same page's ytcfg
    expect(egress.egressFetch.mock.calls.map(([url]) => endpoint(url as string))).toEqual(['interpreter', 'GenerateIT'])
    expect(realm.watched).toHaveLength(1)
    expect(realm.configs).toEqual([expect.objectContaining({ EVENT_ID: 'event-1' })])
  })

  it("the engine page's VM is handed the challenge and the ytcfg of the watch page the frame read", async () => {
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = connectAgent(({ method }) => {
      if (method === 'create') return { result: 7 }
      if (method === 'snapshot') return { result: 'agent snapshot' }
      if (method === 'mint') return { result: 'agent-token' }
      return { result: undefined }
    })
    await readWatchPage()
    expect(await mintPoToken('video-1')).toBe('agent-token')
    expect(agent.creates).toEqual([{
      interpreter: INTERPRETER,
      program: PROGRAM,
      globalName: GLOBAL_NAME,
      config: expect.objectContaining({ EVENT_ID: 'event-1' }),
    }])
    expect(egress.egressFetch.mock.calls.map(([url]) => endpoint(url as string))).toEqual(['interpreter', 'GenerateIT'])
  })

  it("a refused GenerateIT is not the engine page's failure: no second attestation and no Scramjet VM", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    egress.egressFetch.mockImplementation(async (url: string) =>
      endpoint(url) === 'GenerateIT' ? new Response(null, { status: 403 }) : answerEgress(url))
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = connectAgent(({ method }) => {
      if (method === 'create') return { result: 7 }
      if (method === 'snapshot') return { result: 'agent snapshot' }
      return { result: undefined }
    })
    await readWatchPage()
    await mintPoToken('video-1')
    expect(egress.egressFetch.mock.calls.map(([url]) => endpoint(url as string))).toEqual(['interpreter', 'GenerateIT'])
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
    await readWatchPage()
    expect(await mintPoToken('video-1')).toBe(mintedBy('scramjet', 'video-1'))
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
    await readWatchPage()
    let settled = false
    const token = mintPoToken('video-1').finally(() => { settled = true })
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

  it('a Scramjet session the first mint waited only the rest of its wait for is waited on by the next mint', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let integrityTokens = 0
    let answerRetry: (() => void) | undefined
    egress.egressFetch.mockImplementation(async (url: string) => endpoint(url) === 'GenerateIT' && ++integrityTokens > 1
      ? new Promise<Response>((resolve) => { answerRetry = () => resolve(answerEgress(url)) })
      : answerEgress(url))
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
    await readWatchPage()
    const first = mintPoToken('video-1')
    await until(() => create !== 0)
    await vi.advanceTimersByTimeAsync(4_000)
    agent.reply(create, { result: 7 })
    await until(() => answerRetry !== undefined)
    await vi.advanceTimersByTimeAsync(6_000)
    expect(await first).not.toBe(mintedBy('scramjet', 'video-1'))

    const second = mintPoToken('video-2')
    await immediate()
    answerRetry!()
    expect(await second).toBe(mintedBy('scramjet', 'video-2'))
  })

  it('with a watch page that carries no challenge, the token is cold and the frame reports it cold, with no attestation call', async () => {
    vi.unstubAllGlobals()
    realm = installRealm({ challenge: false })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = connectAgent(() => ({ result: undefined }))
    await readWatchPage()
    await mintPoToken('video-1')
    await until(() => agent!.reports.length === 1)
    expect(agent.reports).toEqual([{ type: 'report', mint: 'cold' }])
    expect(agent.requests).toEqual([])
    expect(egress.egressFetch).not.toHaveBeenCalled()
    expect(realm.log).toEqual([])
  })

  it("with the FKN engine timed out, mintPoToken still gets a live session from Scramjet's VM, inside the session wait", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = connectAgent(() => undefined)
    await readWatchPage()
    const token = mintPoToken('video-1')
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
    await readWatchPage()
    expect(await mintPoToken('video-1')).toBe('agent-token')
    expect(realm.log).toEqual([])

    detached = true
    expect(await mintPoToken('video-2')).toBe(mintedBy('scramjet', 'video-2'))
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
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete (globalThis as Record<string, unknown>)[GLOBAL_NAME]
    delete (globalThis as Record<string, unknown>).yt
  })

  it('a session one mint waited its whole wait for sends the next mints cold at once, until a session settles', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let answerIntegrity: (() => void) | undefined
    egress.egressFetch.mockImplementation(async (url: string) => endpoint(url) === 'GenerateIT'
      ? new Promise<Response>((resolve) => { answerIntegrity = () => resolve(answerEgress(url)) })
      : answerEgress(url))
    installRealm()
    const { mintPoToken } = await import('../../../src/frame/botguard')
    await readWatchPage()

    let firstSettled = false
    const first = mintPoToken('video-1').finally(() => { firstSettled = true })
    await until(() => answerIntegrity !== undefined)
    await vi.advanceTimersByTimeAsync(9_999)
    expect(firstSettled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await first).not.toBe(mintedBy('scramjet', 'video-1'))

    // no timer advances from here: a mint that waited on that session or the one started in its place would never settle
    let secondSettled = false
    const second = mintPoToken('video-2').finally(() => { secondSettled = true })
    await until(() => secondSettled)
    expect(secondSettled).toBe(true)
    expect(await second).not.toBe(mintedBy('scramjet', 'video-2'))
    await until(() => egress.egressFetch.mock.calls.length === 4)
    expect(egress.egressFetch.mock.calls.map(([url]) => endpoint(url as string))).toEqual(['interpreter', 'GenerateIT', 'interpreter', 'GenerateIT'])

    answerIntegrity!()
    await vi.waitFor(async () => { expect(await mintPoToken('video-3')).toBe(mintedBy('scramjet', 'video-3')) })
  })

  it('once the session started in place of a waited-out one fails, the next mint waits on a new one', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const integrityAnswers: ((ok: boolean) => void)[] = []
    egress.egressFetch.mockImplementation(async (url: string) => endpoint(url) === 'GenerateIT'
      ? new Promise<Response>((resolve) => {
        integrityAnswers.push(ok => resolve(ok ? answerEgress(url) : new Response(null, { status: 500 })))
      })
      : answerEgress(url))
    installRealm()
    const { mintPoToken } = await import('../../../src/frame/botguard')
    await readWatchPage()

    const first = mintPoToken('video-1')
    await until(() => integrityAnswers.length === 1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await first).not.toBe(mintedBy('scramjet', 'video-1'))
    await until(() => integrityAnswers.length === 2)
    integrityAnswers[1]!(false)
    await until(() => error.mock.calls.length === 1)

    await readWatchPage('video-2')
    const second = mintPoToken('video-2')
    await until(() => integrityAnswers.length === 3)
    integrityAnswers[2]!(true)
    expect(await second).toBe(mintedBy('scramjet', 'video-2'))
  })

  it("with no agent port, every session is this realm's, on the challenge and the ytcfg of the watch page read", async () => {
    const realm = installRealm()
    const { mintPoToken } = await import('../../../src/frame/botguard')
    await readWatchPage()
    expect(await mintPoToken('video-1')).toBe(mintedBy('scramjet', 'video-1'))
    expect(egress.egressFetch.mock.calls.map(([url]) => endpoint(url as string))).toEqual(['interpreter', 'GenerateIT'])
    expect(realm.log).toEqual([`scramjet load ${PROGRAM}`])
    expect(realm.configs).toEqual([expect.objectContaining({ EVENT_ID: 'event-1' })])
    // the next mint is the same session's, with no second challenge
    expect(await mintPoToken('video-2')).toBe(mintedBy('scramjet', 'video-2'))
    expect(egress.egressFetch).toHaveBeenCalledTimes(2)
    expect(realm.watched).toHaveLength(1)
  })

  it("a recovered session runs on a new read of the last video's watch page, not on the page the first session took", async () => {
    const realm = installRealm()
    const { mintPoToken, recoverPoTokenSession } = await import('../../../src/frame/botguard')
    await readWatchPage()
    await mintPoToken('video-1')
    await recoverPoTokenSession()
    expect(realm.watched).toEqual(['https://www.youtube.com/watch?v=video-1', 'https://www.youtube.com/watch?v=video-1'])
    expect(realm.configs).toEqual([expect.objectContaining({ EVENT_ID: 'event-1' }), expect.objectContaining({ EVENT_ID: 'event-2' })])
  })

  it('a session asked for before any watch page was read waits for the first page', async () => {
    const realm = installRealm()
    const { mintPoToken, warmPoTokenSession } = await import('../../../src/frame/botguard')
    warmPoTokenSession('visitor')
    await immediate()
    expect(egress.egressFetch).not.toHaveBeenCalled()
    await readWatchPage()
    expect(await mintPoToken('video-1')).toBe(mintedBy('scramjet', 'video-1'))
    expect(realm.watched).toHaveLength(1)
    expect(egress.egressFetch).toHaveBeenCalledTimes(2)
  })
})

describe('a session that never settles', () => {
  let agent: ReturnType<typeof sessionAgent> | undefined
  let interpreters: (() => void)[]

  // the engine page's VM, numbering its sessions from 1, each minting tokens of its own
  const sessionAgent = () => {
    let created = 0
    const shutdowns: unknown[] = []
    const connected = connectAgent(({ method, args }) => {
      if (method === 'create') return { result: ++created }
      if (method === 'snapshot') return { result: 'agent snapshot' }
      if (method === 'mint') return { result: `token-of-${String(args[0])}` }
      if (method === 'shutdown') shutdowns.push(args[0])
      return { result: undefined }
    })
    return { ...connected, shutdowns }
  }

  // the first mint waits the whole 10000 ms on the first session, whose interpreter fetch has not answered
  const waitOutFirst = async (mintPoToken: (identifier: string) => Promise<string>) => {
    const first = mintPoToken('video-1')
    await until(() => interpreters.length === 1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await first).not.toMatch(/^token-of-/)
  }

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    interpreters = []
    egress.egressFetch.mockReset()
    egress.egressFetch.mockImplementation(async (url: string) => endpoint(url) === 'interpreter'
      ? new Promise<Response>((resolve) => { interpreters.push(() => resolve(answerEgress(url))) })
      : answerEgress(url))
    installRealm()
  })

  afterEach(() => {
    agent?.close()
    agent = undefined
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete (globalThis as Record<string, unknown>)[GLOBAL_NAME]
    delete (globalThis as Record<string, unknown>).yt
  })

  it('once a mint waited it out, a new session starts in the background and the next mint takes its token', async () => {
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = sessionAgent()
    await readWatchPage()
    await waitOutFirst(mintPoToken)
    await until(() => interpreters.length === 2)
    expect(interpreters).toHaveLength(2)
    interpreters[1]!()
    await vi.waitFor(async () => { expect(await mintPoToken('video-2')).toBe('token-of-1') })
  })

  it('never more than one session is started in place of it, however many mints go cold', async () => {
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = sessionAgent()
    await readWatchPage()
    await waitOutFirst(mintPoToken)
    for (const video of ['video-2', 'video-3', 'video-4']) {
      const token = mintPoToken(video)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await token).not.toMatch(/^token-of-/)
    }
    expect(interpreters).toHaveLength(2)
  })

  it('the session waited out is used if it settles late, while the one started in its place is still pending', async () => {
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = sessionAgent()
    await readWatchPage()
    await waitOutFirst(mintPoToken)
    await until(() => interpreters.length === 2)
    interpreters[0]!()
    await vi.waitFor(async () => { expect(await mintPoToken('video-2')).toBe('token-of-1') })
  })

  it('of the two, the first to settle is kept and the later one is shut down', async () => {
    const { mintPoToken } = await import('../../../src/frame/botguard')
    agent = sessionAgent()
    await readWatchPage()
    await waitOutFirst(mintPoToken)
    await until(() => interpreters.length === 2)
    interpreters[1]!()
    await vi.waitFor(async () => { expect(await mintPoToken('video-2')).toBe('token-of-1') })
    interpreters[0]!()
    await vi.waitFor(() => { expect(agent!.shutdowns).toEqual([2]) })
    expect(await mintPoToken('video-3')).toBe('token-of-1')
  })

  it('a recovery waits on it for 10000 ms, not for good, and starts the new session', async () => {
    const { mintPoToken, recoverPoTokenSession, warmPoTokenSession } = await import('../../../src/frame/botguard')
    agent = sessionAgent()
    await readWatchPage()
    warmPoTokenSession('video-1')
    await until(() => interpreters.length === 1)
    let recovered = false
    const recovery = recoverPoTokenSession().finally(() => { recovered = true })
    await vi.advanceTimersByTimeAsync(9_999)
    expect(recovered).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await recovery
    await until(() => interpreters.length === 2)
    interpreters[1]!()
    await vi.waitFor(async () => { expect(await mintPoToken('video-1')).toBe('token-of-1') })
  })

  it('a recovery drops the session that settled late, even while the one started in its place is pending', async () => {
    const { mintPoToken, recoverPoTokenSession } = await import('../../../src/frame/botguard')
    agent = sessionAgent()
    await readWatchPage()
    await waitOutFirst(mintPoToken)
    await until(() => interpreters.length === 2)
    interpreters[0]!()
    await vi.waitFor(async () => { expect(await mintPoToken('video-2')).toBe('token-of-1') })
    await recoverPoTokenSession()
    expect(agent.shutdowns).toEqual([1])
    expect(await mintPoToken('video-3')).not.toMatch(/^token-of-/)
  })
})

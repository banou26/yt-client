import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { BUILD_ID } from '../../src/scramjet/engine-build'
import { SIGNIN_DONE, SIGNIN_HELLO, SIGNIN_PORTS, SIGNIN_WINDOW_PATH } from '../../src/scramjet/protocol'

const showToast = vi.fn()
const resetIdentity = vi.fn(async () => {})
const egressPort = { name: 'signin-port' }
const openEgressPort = vi.fn((_role?: string) => egressPort)

vi.mock('../../src/components/ui/toast', () => ({ showToast }))
vi.mock('../../src/scramjet/client', () => ({ startEngine: async () => ({ resetIdentity }) }))
vi.mock('../../src/scramjet/platform', () => ({ startPlatform: async () => ({ openEgressPort }) }))

const ORIGIN = 'https://youtube.fkn.app'

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

type FakeWindow = { closed: boolean, close: () => void, focus: ReturnType<typeof vi.fn>, postMessage: ReturnType<typeof vi.fn> }

const fakeWindow = (): FakeWindow => {
  const win: FakeWindow = {
    closed: false,
    close: () => { win.closed = true },
    focus: vi.fn(),
    postMessage: vi.fn(),
  }
  return win
}

const install = (opened: FakeWindow | null) => {
  const listeners = new Set<(event: Partial<MessageEvent>) => void>()
  const open = vi.fn((..._args: unknown[]) => opened)
  const reload = vi.fn()
  vi.stubGlobal('window', { open })
  vi.stubGlobal('location', { origin: ORIGIN, reload })
  const stored = new Map<string, string>()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) })
  vi.stubGlobal('screenX', 0)
  vi.stubGlobal('screenY', 0)
  vi.stubGlobal('outerWidth', 1280)
  vi.stubGlobal('outerHeight', 800)
  vi.stubGlobal('addEventListener', (_type: string, listener: (event: Partial<MessageEvent>) => void) => listeners.add(listener))
  vi.stubGlobal('removeEventListener', (_type: string, listener: (event: Partial<MessageEvent>) => void) => listeners.delete(listener))
  const send = (event: Partial<MessageEvent>) => { for (const listener of listeners) listener(event) }
  return { open, reload, send, listeners }
}

describe('the sign-in window', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    showToast.mockClear()
    resetIdentity.mockClear()
    openEgressPort.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('opens the window inside the click, before anything is awaited', async () => {
    const win = fakeWindow()
    const { open } = install(win)
    const { openSignInWindow } = await import('../../src/sign-in')
    void openSignInWindow()
    expect(open).toHaveBeenCalledOnce()
    const [url, name, features] = open.mock.calls[0]! as [string, string, string]
    expect(url).toBe(SIGNIN_WINDOW_PATH)
    expect(name).toBe('yt-client-signin')
    expect(features).toMatch(/^popup,width=500,height=700,/)
  })

  it('answers a blocked window with a toast whose button tries again', async () => {
    const { open } = install(null)
    const { openSignInWindow, signIn } = await import('../../src/sign-in')
    await expect(openSignInWindow()).resolves.toBe('blocked')
    signIn()
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledOnce())
    const [, action] = showToast.mock.calls[0]! as [string, { label: string, onAction: () => void }]
    expect(action.label).toBe('Try again')
    action.onAction()
    expect(open).toHaveBeenCalledTimes(3)
  })

  it("hands the window's hello the sign-in egress port, and nobody else's", async () => {
    const win = fakeWindow()
    const { send } = install(win)
    const { openSignInWindow } = await import('../../src/sign-in')
    void openSignInWindow()
    send({ origin: ORIGIN, source: {} as Window, data: { type: SIGNIN_HELLO, build: BUILD_ID } })
    send({ origin: 'https://evil.example', source: win as unknown as Window, data: { type: SIGNIN_HELLO, build: BUILD_ID } })
    // the answer waits on the platform, so give any answer time to land before reading that none did
    await settle()
    expect(win.postMessage).not.toHaveBeenCalled()
    send({ origin: ORIGIN, source: win as unknown as Window, data: { type: SIGNIN_HELLO, build: BUILD_ID } })
    await settle()
    expect(win.postMessage).toHaveBeenCalledOnce()
    expect(openEgressPort).toHaveBeenCalledWith('signin')
    expect(win.postMessage).toHaveBeenCalledWith({ type: SIGNIN_PORTS }, ORIGIN, [egressPort])
  })

  it('reloads, once, for a window from another build instead of handing it a port', async () => {
    const win = fakeWindow()
    const { send, reload } = install(win)
    const { openSignInWindow } = await import('../../src/sign-in')
    const outcome = openSignInWindow()
    send({ origin: ORIGIN, source: win as unknown as Window, data: { type: SIGNIN_HELLO, build: 'a-later-build' } })
    await expect(outcome).resolves.toBe('closed')
    await settle()
    expect(win.closed).toBe(true)
    expect(win.postMessage).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('closes the window on done, resets the identity and loads the page again', async () => {
    const win = fakeWindow()
    const { send, reload, listeners } = install(win)
    const { signIn } = await import('../../src/sign-in')
    signIn()
    send({ origin: ORIGIN, source: win as unknown as Window, data: { type: SIGNIN_DONE } })
    expect(win.closed).toBe(true)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(resetIdentity).toHaveBeenCalledOnce()
    expect(listeners.size).toBe(0)
  })

  it('does nothing more when the person closes the window', async () => {
    const win = fakeWindow()
    const { reload } = install(win)
    const { openSignInWindow } = await import('../../src/sign-in')
    const outcome = openSignInWindow()
    win.closed = true
    vi.advanceTimersByTime(500)
    await expect(outcome).resolves.toBe('closed')
    expect(reload).not.toHaveBeenCalled()
    expect(resetIdentity).not.toHaveBeenCalled()
  })

  it('focuses the open window on a second click rather than opening another', async () => {
    const win = fakeWindow()
    const { open } = install(win)
    const { openSignInWindow } = await import('../../src/sign-in')
    const first = openSignInWindow()
    const second = openSignInWindow()
    expect(open).toHaveBeenCalledOnce()
    expect(win.focus).toHaveBeenCalledOnce()
    expect(second).toBe(first)
  })
})

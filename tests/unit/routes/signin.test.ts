import { describe, expect, it, vi } from 'vite-plus/test'

type Element = { type: unknown, props: Record<string, unknown> }

const session = { ready: false, signedIn: false }
// wouter and emotion import `react` themselves, which only the app build aliases to preact, so the page renders to plain objects here
const Redirect = () => null
const element = (type: unknown, props: Record<string, unknown>): Element => ({ type, props })

vi.mock('../../../src/session', () => ({ useSession: () => session }))
vi.mock('../../../src/sign-in', () => ({ signIn: () => {} }))
vi.mock('wouter', () => ({ Redirect }))
vi.mock('@emotion/react', () => ({ css: () => undefined }))
vi.mock('@emotion/react/jsx-runtime', () => ({ jsx: element, jsxs: element }))
vi.mock('@emotion/react/jsx-dev-runtime', () => ({ jsxDEV: element }))

const { default: SignInPage } = await import('../../../src/routes/signin')

describe('the /signin page', () => {
  it('sends a signed-in person home', () => {
    Object.assign(session, { ready: true, signedIn: true })
    expect(SignInPage()).toEqual({ type: Redirect, props: { to: '/', replace: true } })
  })

  it('keeps its Sign in button for everyone else', () => {
    for (const state of [{ ready: true, signedIn: false }, { ready: false, signedIn: false }]) {
      Object.assign(session, state)
      expect((SignInPage() as unknown as Element).type).toBe('main')
    }
  })
})

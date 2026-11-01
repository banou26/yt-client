import type { SignInWindowMessage } from './scramjet/protocol'

import { showToast } from './components/ui/toast'
import { startEngine } from './scramjet/client'
import { BUILD_ID, reloadOnceForBuild } from './scramjet/engine-build'
import { startPlatform } from './scramjet/platform'
import { SIGNIN_DONE, SIGNIN_HELLO, SIGNIN_PORTS, SIGNIN_WINDOW_PATH } from './scramjet/protocol'

/**
 * How a sign-in window ended: `'authed'` once its jar holds the session (the window is closed), `'closed'` when the
 * person closed it first, `'blocked'` when the browser opened no window.
 */
export type SignInOutcome = 'authed' | 'closed' | 'blocked'

// FKN's window size, the one stub's sign-in windows open at
const WIDTH = 500
const HEIGHT = 700
const CLOSED_POLL_MS = 500

let open: { window: Window, outcome: Promise<SignInOutcome> } | undefined

/**
 * Opens Google's sign-in in a window of its own and resolves once it ends. Call it directly in the click handler:
 * an await before it would open the window without the click's activation. A second call while a window is open
 * focuses that window and shares its outcome.
 */
export const openSignInWindow = (): Promise<SignInOutcome> => {
  if (open && !open.window.closed) {
    open.window.focus()
    return open.outcome
  }
  const left = Math.round(screenX + (outerWidth - WIDTH) / 2)
  const top = Math.round(screenY + (outerHeight - HEIGHT) / 2)
  const win = window.open(SIGNIN_WINDOW_PATH, 'yt-client-signin', `popup,width=${WIDTH},height=${HEIGHT},left=${left},top=${top}`)
  if (!win) return Promise.resolve('blocked')
  const outcome = new Promise<SignInOutcome>((resolve) => {
    let settled = false
    const settle = (value: SignInOutcome) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      removeEventListener('message', onMessage)
      if (open?.window === win) open = undefined
      resolve(value)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== win) return
      const message = event.data as SignInWindowMessage | undefined
      if (message?.type === SIGNIN_HELLO) {
        if (message.build !== BUILD_ID) {
          win.close()
          settle('closed')
          reloadOnceForBuild(message.build)
          return
        }
        void startPlatform().then(
          (platform) => win.postMessage({ type: SIGNIN_PORTS }, location.origin, [platform.openEgressPort('signin')]),
          () => win.close(),
        )
      } else if (message?.type === SIGNIN_DONE) {
        win.close()
        settle('authed')
      }
    }
    addEventListener('message', onMessage)
    const poll = setInterval(() => { if (win.closed) settle('closed') }, CLOSED_POLL_MS)
  })
  open = { window: win, outcome }
  return outcome
}

/** What every Sign in control calls on its click: after a sign-in the page loads again, signed in. */
export const signIn = () => {
  void openSignInWindow().then(async (outcome) => {
    if (outcome === 'blocked') {
      showToast('The browser blocked the sign-in window. Allow pop-ups for this site.', { label: 'Try again', onAction: signIn })
      return
    }
    if (outcome !== 'authed') return
    await (await startEngine()).resetIdentity().catch(() => {})
    location.reload()
  })
}

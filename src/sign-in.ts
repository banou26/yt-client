import type { SignInWindowMessage } from './scramjet/protocol'

import { showToast } from './components/ui/toast'
import { storeChannel } from './scramjet/channel'
import { clearSessionCookies, startEngine } from './scramjet/client'
import { BUILD_ID, reloadOnceForBuild } from './scramjet/engine-build'
import { jarHoldsSession } from './scramjet/jar'
import { startPlatform } from './scramjet/platform'
import { SIGNIN_DONE, SIGNIN_HELLO, SIGNIN_PORTS, SIGNIN_WINDOW_PATH } from './scramjet/protocol'

/**
 * How a sign-in window ended: `'authed'` once its jar holds the session (the window is closed), `'closed'` when the
 * person closed it first, `'blocked'` when the browser opened no window, `'outdated'` when the window is from another
 * build and this page already used its one reload for that pair of builds.
 */
export type SignInOutcome = 'authed' | 'closed' | 'blocked' | 'outdated'

// FKN's window size, the one stub's sign-in windows open at
const WIDTH = 500
const HEIGHT = 700
const CLOSED_POLL_MS = 500

// every tab's engine reads the cookies and the channel once at boot, so a sign-in or a switch in any tab reloads them all
const SIGNED_IN_CHANNEL = 'yt-client-signed-in'
const SIGNED_IN = 'signed-in'
const SWITCHED = 'switched'

let openWindow: Window | undefined
let finishing = false

// the /signin page has nothing left for a signed-in person
const landSignedIn = () => {
  if (location.pathname === '/signin') location.assign('/')
  else location.reload()
}

const tabs = new BroadcastChannel(SIGNED_IN_CHANNEL)
tabs.addEventListener('message', (event: MessageEvent) => {
  if (event.data === SWITCHED) {
    location.reload()
    return
  }
  if (event.data !== SIGNED_IN || finishing) return
  finishing = true
  openWindow?.close()
  landSignedIn()
})

const finishSignIn = async () => {
  if (finishing) return
  finishing = true
  storeChannel()
  await startEngine().then((engine) => engine.resetIdentity()).catch(() => {})
  tabs.postMessage(SIGNED_IN)
  landSignedIn()
}

/**
 * Opens Google's sign-in in a window of its own and resolves once it ends. Call it directly in the click handler:
 * an await before it would open the window without the click's activation.
 */
export const openSignInWindow = (): Promise<SignInOutcome> => {
  const left = Math.round(screenX + (outerWidth - WIDTH) / 2)
  const top = Math.round(screenY + (outerHeight - HEIGHT) / 2)
  // never a fixed name: another tab's click would load this tab's window, which answers only this tab
  const win = window.open(SIGNIN_WINDOW_PATH, '_blank', `popup,width=${WIDTH},height=${HEIGHT},left=${left},top=${top}`)
  if (!win) return Promise.resolve('blocked')
  openWindow = win
  return new Promise<SignInOutcome>((resolve) => {
    let settled = false
    const settle = (value: SignInOutcome) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      removeEventListener('message', onMessage)
      if (openWindow === win) openWindow = undefined
      resolve(value)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== win) return
      const message = event.data as SignInWindowMessage | undefined
      if (message?.type === SIGNIN_HELLO) {
        if (message.build !== BUILD_ID) {
          win.close()
          settle(reloadOnceForBuild(message.build) ? 'closed' : 'outdated')
          return
        }
        // a platform that cannot start leaves the window open, to say so itself once its wait for the port runs out
        void startPlatform().then(
          (platform) => win.postMessage({ type: SIGNIN_PORTS }, location.origin, [platform.openEgressPort('signin')]),
          () => {},
        )
      } else if (message?.type === SIGNIN_DONE) {
        win.close()
        settle('authed')
      }
    }
    addEventListener('message', onMessage)
    // a window closed after Google finished but before its own check fired has still left the session in the jar
    const poll = setInterval(() => {
      if (!win.closed) return
      clearInterval(poll)
      void jarHoldsSession().then((session) => settle(session ? 'authed' : 'closed'))
    }, CLOSED_POLL_MS)
  })
}

/** What every Sign in control calls on its click. While a window is open, a click focuses it. */
export const signIn = () => {
  if (finishing) return
  if (openWindow && !openWindow.closed) {
    openWindow.focus()
    return
  }
  void openSignInWindow().then((outcome) => {
    if (outcome === 'blocked') showToast('The browser blocked the sign-in window. Allow pop-ups for this site.', { label: 'Try again', onAction: signIn })
    else if (outcome === 'outdated') showToast('The app was updated. Reload the page to sign in.', { label: 'Reload', onAction: () => location.reload() })
    else if (outcome === 'authed') void finishSignIn()
  })
}

/**
 * Makes every tab act as another channel of the signed-in Google account: a brand channel's page ID, or none for the
 * account's own channel. Each tab's next engine sends it (scramjet/channel.ts), so every tab loads again.
 */
export const switchChannel = (brandPageId?: string) => {
  storeChannel(brandPageId)
  tabs.postMessage(SWITCHED)
  location.assign('/')
}

/** Signs out and goes home. The cookie clear IS the sign-out, so it throws, staying on the page, when the jar could not be cleared. */
export const signOut = async () => {
  try {
    await (await startEngine()).resetIdentity()
  } catch {}
  await clearSessionCookies()
  storeChannel()
  location.assign('/')
}

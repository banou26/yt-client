import type { EgressApi, SignInPorts, SignInWindowMessage } from './protocol'

import { defaultConfigDev } from '@mercuryworkshop/scramjet'
import { Controller } from '@mercuryworkshop/scramjet-controller'
import { expose } from 'osra'

import { BUILD_ID } from './engine-build'
import { createWebvpnTransport } from './fkn-transport'
import { EGRESS_KEY, SIGNIN_DONE, SIGNIN_HELLO, SIGNIN_PORTS } from './protocol'
import { CONTROLLER_CONFIG, scramjetWorker } from './scramjet-setup'

// Start on youtube.com and let ITS Sign in button carry the flow to Google: going straight to accounts.google.com leaves the login underconfigured (the Next/password step silently no-ops).
const SIGN_IN_URL = 'https://www.youtube.com/'
const isYoutubeHop = (target: string) => /^https:\/\/(?:[a-z0-9-]+\.)*youtube\.com\//.test(target)

const PORTS_TIMEOUT_MS = 15_000
const PREWARM_CAP_MS = 8_000
const REVEAL_FALLBACK_MS = 20_000
const POLL_MS = 500
// the opener closes the window on SIGNIN_DONE; this only covers an opener that went away meanwhile
const SELF_CLOSE_MS = 2_000

const stage = (value: string) => {
  document.documentElement.dataset.stage = value
}

const toOpener = (message: SignInWindowMessage) => {
  ;(window.opener as Window | null)?.postMessage(message, location.origin)
}

const egressPort = () => new Promise<MessagePort>((resolve, reject) => {
  const opener = window.opener as Window | null
  if (!opener) {
    reject(new Error('yt-client: the sign-in window has no opener'))
    return
  }
  const timeout = setTimeout(() => {
    window.removeEventListener('message', onMessage)
    reject(new Error('yt-client: the app never sent the sign-in port'))
  }, PORTS_TIMEOUT_MS)
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== location.origin || event.source !== opener) return
    const port = event.ports[0]
    if ((event.data as SignInPorts | undefined)?.type !== SIGNIN_PORTS || !port) return
    window.removeEventListener('message', onMessage)
    clearTimeout(timeout)
    resolve(port)
  }
  window.addEventListener('message', onMessage)
  toOpener({ type: SIGNIN_HELLO, build: BUILD_ID })
})

const boot = async () => {
  stage('bootstrap')
  const [serviceworker, port] = await Promise.all([scramjetWorker(), egressPort()])
  port.start()
  const remote = expose<EgressApi>({}, { key: EGRESS_KEY, transport: { receive: port, emit: port } })
  // the whole flow over libcurl: Google refuses a sign-in split across egress paths, and the extension cannot surface a manual redirect
  const transport = createWebvpnTransport(remote)
  await transport.init()
  const controller = new Controller({ serviceworker, transport, config: CONTROLLER_CONFIG, scramjetConfig: defaultConfigDev })
  await controller.wait()
  stage('controller')

  const element = document.createElement('iframe')
  document.body.appendChild(element)
  const proxied = controller.createFrame(element)

  const target = () => {
    try {
      const path = element.contentWindow?.location.pathname ?? ''
      if (!path.startsWith(proxied.prefix)) return ''
      return controller.config.codec.decode(path.slice(proxied.prefix.length))
    } catch {
      return ''
    }
  }

  const rendered = () => {
    try {
      const doc = element.contentDocument
      return !!doc && doc.readyState !== 'loading' && (doc.body?.childElementCount ?? 0) > 2
    } catch {
      return false
    }
  }

  const signedIn = (current: string) => {
    const cookies = controller.cookieJar.getCookies(new URL('https://www.youtube.com/'), false) as string
    return /(?:^|;\s*)SAPISID=/.test(cookies) && !current.startsWith('https://accounts.google.com/')
  }

  let advanced = false
  let revealed = false
  let finished = false
  const reveal = () => {
    revealed = true
    element.style.visibility = 'visible'
    stage('google')
  }
  const fallback = setTimeout(() => { if (!revealed) reveal() }, REVEAL_FALLBACK_MS)

  const finish = async () => {
    finished = true
    clearInterval(poll)
    clearTimeout(fallback)
    stage('done')
    // every Set-Cookie already persisted the jar; this last write is what the engine reads after the app reloads
    await controller.persistCookies()
    toOpener({ type: SIGNIN_DONE })
    setTimeout(() => window.close(), SELF_CLOSE_MS)
  }

  const check = () => {
    if (finished) return
    const current = target()
    if (current && isYoutubeHop(current)) element.style.visibility = 'hidden'
    else if (current && rendered()) reveal()
    // youtube.com's own Sign in link, so the hop to Google carries youtube.com as its referer; scoped to youtube.com so it never hits Google's footer links
    if (!advanced && isYoutubeHop(current)) {
      try {
        const link = element.contentDocument?.querySelector<HTMLElement>('a[href*="ServiceLogin"]')
        if (link) {
          advanced = true
          link.click()
        }
      } catch {}
    }
    if (signedIn(current)) void finish()
  }
  element.addEventListener('load', check)
  const poll = setInterval(check, POLL_MS)

  // a cold libcurl dial to a never-warmed host hangs, so pay that cost up front, capped
  const api = await remote
  await Promise.race([
    Promise.allSettled([api.prewarm('www.youtube.com'), api.prewarm('accounts.google.com')]),
    new Promise((resolve) => setTimeout(resolve, PREWARM_CAP_MS)),
  ])
  proxied.go(SIGN_IN_URL)
}

void boot().catch((error: unknown) => {
  console.error('[yt-client] sign-in window:', error)
  stage('error')
})

import type { EgressApi, ExtFetchRequest, ExtFetchResponse, HostBootstrap, HostControlEvent, HostControlRequest, HostHello, TransportResponse } from './protocol'
import type { FrameEgressRequest, FrameEgressResponse } from '../frame/protocol'

import { defaultConfigDev } from '@mercuryworkshop/scramjet'
import { Tap } from '@mercuryworkshop/scramjet'
import { Controller } from '@mercuryworkshop/scramjet-controller'
import { expose } from 'osra'

import { CLEAR_COOKIES, COOKIES_CLEARED, EGRESS_KEY, ENGINE_READY, HOST_BOOTSTRAP, HOST_HELLO } from './protocol'
import { FRAME_AGENT_CONNECT, FRAME_CONNECT, FRAME_DIRECT_CONNECT, FRAME_EGRESS_CONNECT } from '../frame/protocol'
import { readChannel, storeChannel } from './channel'
import { BUILD_ID, ENGINE_BUILD_MISMATCH } from './engine-build'
import { createFknTransport, FRAME_BOOTSTRAP_URL } from './fkn-transport'
import { jarHoldsSession } from './jar'
import { CONTROLLER_CONFIG, scramjetWorker } from './scramjet-setup'
import type { ExtEgressFetch } from './fkn-transport'

type FrameWindow = Window & {
  [FRAME_CONNECT]?: (port: MessagePort) => void
  [FRAME_EGRESS_CONNECT]?: (port: MessagePort) => void
  [FRAME_AGENT_CONNECT]?: (port: MessagePort) => void
  [FRAME_DIRECT_CONNECT]?: (port: MessagePort) => void
  $scramerr?: (error: unknown) => void
}

const stage = (value: string) => {
  document.documentElement.dataset.stage = value
}

const BOOTSTRAP_TIMEOUT_MS = 30_000

const bootstrap = new Promise<{ egress: MessagePort, extFetch: MessagePort, agent?: MessagePort, direct?: MessagePort }>((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error('yt-client: engine bootstrap ports never arrived')),
    BOOTSTRAP_TIMEOUT_MS,
  )
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== location.origin || event.source !== window.parent) return
    const message = event.data as Partial<HostBootstrap> | undefined
    if (message?.type !== HOST_BOOTSTRAP) return
    window.removeEventListener('message', onMessage)
    clearTimeout(timeout)
    if (message.build !== BUILD_ID) {
      for (const port of event.ports) port.close()
      reject(new Error(ENGINE_BUILD_MISMATCH))
      return
    }
    const ports = [...event.ports]
    const direct = message.direct ? ports.pop() : undefined
    const [egress, extFetch, agent] = ports
    if (!egress || !extFetch) {
      reject(new Error('yt-client: engine bootstrap ports are missing'))
      return
    }
    resolve({ egress, extFetch, agent, direct })
  }
  window.addEventListener('message', onMessage)
  window.parent.postMessage({ type: HOST_HELLO, build: BUILD_ID } satisfies HostHello, location.origin)
})

const createExtFetch = (port: MessagePort): ExtEgressFetch => {
  let requestId = 0
  const pending = new Map<number, { resolve(value: TransportResponse | null): void, reject(reason: unknown): void }>()
  port.addEventListener('message', (event) => {
    const message = event.data as ExtFetchResponse
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error))
    else request.resolve(message.response ?? null)
  })
  port.start()
  return (url, options, signal) => new Promise<TransportResponse | null>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const id = ++requestId
    pending.set(id, { resolve, reject })
    signal?.addEventListener('abort', () => {
      if (!pending.delete(id)) return
      port.postMessage({ type: 'cancel', id } satisfies ExtFetchRequest)
      reject(signal.reason)
    }, { once: true })
    // `options.body` is NOT transferred: the caller reuses this same options object on the tunnelled fallback, and a transferred ArrayBuffer would reach it detached.
    port.postMessage({ type: 'fetch', id, url, options } satisfies ExtFetchRequest)
  })
}

// this realm is the app's own, so it reads the channel the frame's Scramjet-scoped storage cannot; a session that ended
// with no loggedOut answer to read (an expired or cleared SAPISID) keeps none
const channelForSession = async () => {
  if (await jarHoldsSession()) return readChannel()
  storeChannel()
  return undefined
}

const boot = async () => {
  stage('service-worker')
  const workerReady = scramjetWorker()
  const frameCodePromise = fetch('/__yt_scramjet__/youtube-frame.js').then((response) => response.text())
  const channelReady = channelForSession()
  stage('bootstrap')
  const transportReady = bootstrap.then(async ({ egress, extFetch: extFetchPort, agent, direct }) => {
    egress.start()
    const remote = expose<EgressApi>({}, {
      key: EGRESS_KEY,
      transport: { receive: egress, emit: egress },
    })
    const extFetch = createExtFetch(extFetchPort)
    const transport = createFknTransport(remote, extFetch, await channelReady)
    await transport.init()
    return { egress, extFetchPort, remote, transport, extFetch, agent, direct }
  })
  const [serviceworker, { egress, extFetchPort, remote, transport, extFetch, agent, direct }] = await Promise.all([workerReady, transportReady])

  stage('controller')
  const controller = new Controller({
    serviceworker,
    transport,
    config: CONTROLLER_CONFIG,
    scramjetConfig: defaultConfigDev,
  })
  await controller.wait()
  stage('frame')

  const clearCookies = async (id: number, port: MessagePort) => {
    try {
      controller.cookieJar.clear()
      await controller.persistCookies()
      await controller.propagateCookieSync([], { clear: true }).catch(() => {})
      port.postMessage({ type: COOKIES_CLEARED, id } satisfies HostControlEvent)
    } catch (error) {
      port.postMessage({
        type: COOKIES_CLEARED,
        id,
        error: String((error as Error)?.message ?? error),
      } satisfies HostControlEvent)
    }
  }

  let controlPort: MessagePort | undefined
  const connectControl = () => {
    const channel = new MessageChannel()
    controlPort = channel.port1
    channel.port1.addEventListener('message', (event) => {
      const message = event.data as HostControlRequest
      if (message.type === CLEAR_COOKIES) void clearCookies(message.id, channel.port1)
    })
    channel.port1.start()
    return channel
  }

  const frame = document.createElement('iframe')
  frame.hidden = true
  frame.setAttribute('allow', 'autoplay; encrypted-media')
  document.body.appendChild(frame)
  const proxiedFrame = controller.createFrame(frame)
  let frameEgressPort: MessagePort | undefined
  const frameCode = await frameCodePromise
  Tap.tap(proxiedFrame.hooks.init.post, (context) => {
    if (!context.isTopLevel) return
    const run = context.client.natives.call('Function', null, frameCode)
    run()
    stage('frame-code')
    const apiChannel = new MessageChannel()
    const frameWindow = context.window as FrameWindow
    frameWindow.$scramerr = () => {}
    const egressChannel = new MessageChannel()
    frameEgressPort = egressChannel.port2
    const egressAborts = new Map<number, AbortController>()
    egressChannel.port2.addEventListener('message', (event) => {
      const request = event.data as FrameEgressRequest
      const egressRequestId = `frame:${proxiedFrame.id}:${request.id}`
      if (request.type === 'cancel') {
        egressAborts.get(request.id)?.abort()
        egressAborts.delete(request.id)
        void remote.then((api) => api.cancelLibcurlFetch(egressRequestId)).catch(() => {})
        return
      }
      const abort = new AbortController()
      egressAborts.set(request.id, abort)
      const run = async () => {
        const viaExtension = await extFetch(request.url, request.options, abort.signal)
        if (viaExtension) return viaExtension
        return (await remote).libcurlFetch(egressRequestId, request.url, request.options)
      }
      void run().then(
        (response) => {
          egressAborts.delete(request.id)
          const message = { id: request.id, response } satisfies FrameEgressResponse
          egressChannel.port2.postMessage(message, response.body ? [response.body] : [])
        },
        (error) => {
          egressAborts.delete(request.id)
          egressChannel.port2.postMessage({
            id: request.id,
            error: error instanceof Error ? error.message : String(error),
          } satisfies FrameEgressResponse)
        },
      )
    })
    egressChannel.port2.start()
    const connectEgress = frameWindow[FRAME_EGRESS_CONNECT]
    if (!connectEgress) throw new Error('yt-client: frame egress connector is missing')
    delete frameWindow[FRAME_EGRESS_CONNECT]
    connectEgress(egressChannel.port1)
    const connectAgent = frameWindow[FRAME_AGENT_CONNECT]
    delete frameWindow[FRAME_AGENT_CONNECT]
    // a frame with no connector mints in its own realm, as it does with no port
    if (agent && connectAgent) connectAgent(agent)
    else agent?.close()
    const connectDirect = frameWindow[FRAME_DIRECT_CONNECT]
    delete frameWindow[FRAME_DIRECT_CONNECT]
    if (direct && connectDirect) connectDirect(direct)
    else direct?.close()
    const connect = frameWindow[FRAME_CONNECT]
    if (!connect) throw new Error('yt-client: frame connector is missing')
    delete frameWindow[FRAME_CONNECT]
    connect(apiChannel.port1)
    stage('frame-connected')
    const controlChannel = connectControl()
    window.parent.postMessage({ type: ENGINE_READY }, location.origin, [apiChannel.port2, controlChannel.port2])
    stage('frame-posted')
  })
  proxiedFrame.go(FRAME_BOOTSTRAP_URL)
  window.addEventListener('pagehide', () => {
    egress.close()
    extFetchPort.close()
    frameEgressPort?.close()
    controlPort?.close()
    agent?.close()
    direct?.close()
  }, { once: true })

  return { controller, frame: proxiedFrame }
}

void boot().catch((error) => {
  stage('error')
  window.parent.postMessage({
    type: ENGINE_READY,
    error: error instanceof Error ? error.message : String(error),
  }, location.origin)
})

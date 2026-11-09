const waitForWorker = async (registration: ServiceWorkerRegistration) => {
  if (registration.active) return registration.active
  await new Promise<void>((resolve) => {
    const worker = registration.installing ?? registration.waiting
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve()
    })
  })
  if (!registration.active) throw new Error('yt-client: Scramjet service worker did not activate')
  return registration.active
}

const SCRIPT = '/__yt_scramjet__/sw.js'

/**
 * The Scramjet service worker every Controller of this origin shares. A page it already controls, which is every load
 * after the first, takes it without calling register(): Chrome queues that call behind the update check it scheduled
 * after earlier loads in this scope, and starts that check as lowest-priority work, which a browser that started
 * recently holds until its first page goes idle (1.5 to 3.4 s on return visits, Chrome 156, measured 2026-11-10).
 * Since a controlled page never registers, a change to the register options below needs a new script URL to reach it.
 */
export const scramjetWorker = async () => {
  const controller = navigator.serviceWorker.controller
  if (controller?.scriptURL === location.origin + SCRIPT) return controller
  return waitForWorker(await navigator.serviceWorker.register(SCRIPT, {
    scope: '/__yt_scramjet__/',
    type: 'classic',
    updateViaCache: 'none',
  }))
}

/** The Controller config of the engine and of the sign-in window. Their cookie jars meet in IndexedDB `__scramjet_controller`. */
export const CONTROLLER_CONFIG = {
  prefix: '/__yt_scramjet__/proxy/',
  scramjetPath: '/__yt_scramjet__/scramjet/scramjet.js',
  injectPath: '/__yt_scramjet__/controller/controller.inject.js',
  wasmPath: '/__yt_scramjet__/scramjet/scramjet.wasm',
  virtualWasmPath: 'scramjet.wasm.js',
}

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

/** The Scramjet service worker every Controller of this origin shares; registering again is a no-op. */
export const scramjetWorker = () =>
  navigator.serviceWorker.register('/__yt_scramjet__/sw.js', {
    scope: '/__yt_scramjet__/',
    type: 'classic',
    updateViaCache: 'none',
  }).then(waitForWorker)

/** The Controller config of the engine and of the sign-in window. Their cookie jars meet in IndexedDB `__scramjet_controller`. */
export const CONTROLLER_CONFIG = {
  prefix: '/__yt_scramjet__/proxy/',
  scramjetPath: '/__yt_scramjet__/scramjet/scramjet.js',
  injectPath: '/__yt_scramjet__/controller/controller.inject.js',
  wasmPath: '/__yt_scramjet__/scramjet/scramjet.wasm',
  virtualWasmPath: 'scramjet.wasm.js',
}

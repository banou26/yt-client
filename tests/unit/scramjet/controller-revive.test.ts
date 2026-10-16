/// <reference types="vite/client" />
import { afterEach, expect, it, vi } from 'vite-plus/test'

// the bundle the engine page loads, as patches/@mercuryworkshop+scramjet-controller+0.0.14.patch leaves it
import source from '../../../node_modules/@mercuryworkshop/scramjet-controller/dist/controller.api.js?raw'

type Registration = { id: string, port: MessagePort }

// node's own vm: vite.config.ts shims the bare node modules to browser polyfills under vp test
const vm = (globalThis as unknown as { process: { getBuiltinModule: (id: string) => { runInThisContext: (code: string) => unknown } } })
  .process.getBuiltinModule('node:vm')

const opened: MessagePort[] = []
afterEach(() => {
  for (const port of opened.splice(0)) port.close()
  vi.unstubAllGlobals()
})

const startController = () => {
  const registrations: Registration[] = []
  const swListeners: ((event: { data: unknown }) => void)[] = []
  const known: Record<PropertyKey, unknown> = {
    versionInfo: { version: '2.0.67-alpha.2' },
    defaultConfig: {},
    defaultConfigDev: {},
    CookieJar: class { load() {} clear() {} },
  }
  vi.stubGlobal('$scramjet', new Proxy(known, { get: (target, key) => key in target ? target[key] : class {} }))
  const navigator = { serviceWorker: { addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => swListeners.push(listener) } }
  const load = vm.runInThisContext(`(function (navigator, BroadcastChannel, fetch, indexedDB) {\n${source}\nreturn $scramjetController\n})`) as (...stubs: unknown[]) => unknown
  const { Controller } = load(
    navigator,
    class { addEventListener() {} postMessage() {} },
    () => new Promise(() => {}),
    { open: () => ({}) },
  ) as { Controller: new (init: unknown) => unknown }
  const serviceworker = {
    postMessage: (message: { $controller$init?: { id: string } }, transfer: MessagePort[] = []) => {
      if (!message.$controller$init || !transfer[0]) return
      opened.push(transfer[0])
      registrations.push({ id: message.$controller$init.id, port: transfer[0] })
    },
  }
  new Controller({ serviceworker, transport: {} })

  return {
    registrations,
    revive: (instance: string) => {
      for (const listener of swListeners) listener({ data: { $controller$swrevive: { instance } } })
    },
    // what controller.sw.js sends from a worker once the page's registration reaches it
    ready: (instance: string) => new Promise<void>((resolve) => {
      const { id, port } = registrations.at(-1)!
      port.onmessage = () => resolve()
      port.postMessage({ [`tabchannel-${id}`]: { $type: 'request', $method: 'ready', $args: instance, $token: 0 } })
    }),
  }
}

it('registers again with every service worker that starts, one that ends before it answers included', async () => {
  const controller = startController()
  expect(controller.registrations.length).toBe(1)
  controller.revive('first')
  expect(controller.registrations.length, 'the first registration is still on its way').toBe(1)
  await controller.ready('first')
  controller.revive('first')
  expect(controller.registrations.length, 'the worker that holds the port').toBe(1)

  controller.revive('second')
  expect(controller.registrations.length).toBe(2)
  controller.revive('third')
  expect(controller.registrations.length, 'the second worker ended before it answered ready').toBe(3)
  controller.revive('third')
  expect(controller.registrations.length).toBe(3)

  await controller.ready('third')
  controller.revive('fourth')
  expect(controller.registrations.length).toBe(4)
})

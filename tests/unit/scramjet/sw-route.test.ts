/// <reference types="vite/client" />
import { afterEach, expect, it, vi } from 'vite-plus/test'

import workerSource from '../../../public/__yt_scramjet__/sw.js?raw'
// the routing half of the worker, as patches/@mercuryworkshop+scramjet-controller+0.0.14.patch leaves it
import controllerSource from '../../../node_modules/@mercuryworkshop/scramjet-controller/dist/controller.sw.js?raw'

// node's own vm: vite.config.ts shims the bare node modules to browser polyfills under vp test
const vm = (globalThis as unknown as { process: { getBuiltinModule: (id: string) => { runInThisContext: (code: string) => unknown } } })
  .process.getBuiltinModule('node:vm')

const CONTROLLER_ID = 'ctl1'
const PROXIED_BROWSE = `https://youtube.fkn.app/__yt_scramjet__/proxy/${CONTROLLER_ID}/frame1/${encodeURIComponent('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false&alt=json')}`

type FetchEvent = {
  request: Request
  clientId: string
  resultingClientId: string
  respondWith: (answer: Promise<Response>) => void
}

const opened: MessagePort[] = []
afterEach(() => {
  for (const port of opened.splice(0)) port.close()
  vi.useRealTimers()
})

// a worker Chrome has just started: both scripts evaluated, no controller registered yet
const startWorker = () => {
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const addEventListener = (type: string, listener: (event: unknown) => void) => {
    (listeners[type] ??= []).push(listener)
  }
  const clients = { matchAll: async () => [], get: async () => undefined, claim: async () => {} }
  const skipWaiting = vi.fn(async () => {})
  const load = vm.runInThisContext(`(function (self, addEventListener, clients, importScripts) {\n${controllerSource}\n${workerSource}\n})`) as (...stubs: unknown[]) => void
  load({ addEventListener, skipWaiting }, addEventListener, clients, () => {})
  const install = () => {
    for (const listener of listeners.install ?? []) listener({ waitUntil: () => {} })
  }

  const fetch = (url: string, init?: RequestInit) => {
    let answer: Promise<Response> | undefined
    const event: FetchEvent = {
      request: new Request(url, init),
      clientId: 'frame-client',
      resultingClientId: '',
      respondWith: (value) => { answer = value },
    }
    for (const listener of listeners.fetch ?? []) listener(event)
    return answer
  }

  // what a page's Controller sends on the revive, then what it answers on its port
  const registerController = () => {
    const channel = new MessageChannel()
    opened.push(channel.port1, channel.port2)
    const requests: { method: string, rawUrl: string }[] = []
    channel.port1.onmessage = (event: MessageEvent) => {
      const call = (event.data as Record<string, { $type: string, $method: string, $args: { method: string, rawUrl: string }, $token: number }>)[`tabchannel-${CONTROLLER_ID}`]
      if (call?.$type !== 'request' || call.$method !== 'request') return
      requests.push({ method: call.$args.method, rawUrl: call.$args.rawUrl })
      channel.port1.postMessage({
        [`tabchannel-${CONTROLLER_ID}`]: { $type: 'response', $token: call.$token, $data: { body: 'routed', status: 200, statusText: 'OK', headers: [] } },
      })
    }
    for (const listener of listeners.message ?? []) {
      listener({ data: { $controller$init: { prefix: `/__yt_scramjet__/proxy/${CONTROLLER_ID}/`, id: CONTROLLER_ID } }, ports: [channel.port2] })
    }
    return requests
  }

  return { fetch, registerController, install, skipWaiting }
}

it('holds a proxied POST that starts the worker until a controller registers, never leaving it to the network', async () => {
  const worker = startWorker()
  const answer = worker.fetch(PROXIED_BROWSE, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
  expect(answer, 'a request left to the network gets the static host\'s 405').toBeDefined()

  await new Promise((resolve) => setTimeout(resolve, 60))
  const requests = worker.registerController()
  const response = await answer!
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('routed')
  expect(requests).toEqual([{ method: 'POST', rawUrl: PROXIED_BROWSE }])
})

it('routes at once while a controller is registered', async () => {
  const worker = startWorker()
  const requests = worker.registerController()
  const response = await worker.fetch(PROXIED_BROWSE, { method: 'POST', body: '{}' })!
  expect(response.status).toBe(200)
  expect(requests.length).toBe(1)
})

it('answers 503 when no controller registers within 10 s', async () => {
  vi.useFakeTimers()
  const worker = startWorker()
  const answer = worker.fetch(PROXIED_BROWSE, { method: 'POST', body: '{}' })
  expect(answer).toBeDefined()
  await vi.advanceTimersByTimeAsync(9_900)
  let settled = false
  void answer!.then(() => { settled = true })
  await vi.advanceTimersByTimeAsync(0)
  expect(settled, 'still waiting before the deadline').toBe(false)
  await vi.advanceTimersByTimeAsync(200)
  expect((await answer!).status).toBe(503)
})

it('does not take over pages still registered with the worker before it', () => {
  const worker = startWorker()
  worker.install()
  expect(worker.skipWaiting).not.toHaveBeenCalled()
})

it('leaves the host page and the static files to the network', () => {
  const worker = startWorker()
  worker.registerController()
  expect(worker.fetch('https://youtube.fkn.app/__yt_scramjet__/host.html')).toBeUndefined()
  expect(worker.fetch('https://youtube.fkn.app/__yt_scramjet__/scramjet/scramjet.js')).toBeUndefined()
})

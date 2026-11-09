import { expose } from 'osra'
import { describe, expect, it } from 'vite-plus/test'

import type { ExtFetchRequest, ExtFetchResponse, TransportResponse } from '../../../src/scramjet/protocol'
import { releaseWhenOver, serveExtFetch } from '../../../src/scramjet/platform'

type Extension = { fetch(url: string, init: { signal: AbortSignal }): Promise<ReadableStream<Uint8Array> | null> }

// a body that gives one chunk and then errors, as an upstream connection that drops mid-answer
const broken = () => {
  let pulls = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulls++ === 0) controller.enqueue(new TextEncoder().encode('partial'))
      else controller.error(new Error('upstream dropped'))
    },
  })
}

// the extension as @fkn/lib reaches it: osra over a port, a fetch that takes the request's signal and answers a body
const connect = async () => {
  const { port1, port2 } = new MessageChannel()
  void expose({
    fetch: async (url: string, _init: { signal: AbortSignal }) => {
      if (url === 'refused') throw new Error('extension refused the request')
      return url === 'broken' ? broken() : new Response(url === 'empty' ? null : `answer to ${url}`).body
    },
  } satisfies Extension, { transport: port1 })
  return expose<Extension>({}, { transport: port2 })
}

const answer = (body: ReadableStream<Uint8Array> | null): TransportResponse => ({ status: 200, statusText: 'OK', headers: [], body })

// node's own count: the build config's polyfills stand in for node:events and a bare `process`, not for globalThis.process
const events = (globalThis as unknown as { process: NodeJS.Process }).process.getBuiltinModule('node:events')

const listenersOf = (signals: AbortSignal[]) => signals.reduce((count, signal) => count + events.getEventListeners(signal, 'abort').length, 0)

describe('an extension fetch\'s signal', () => {
  it('keeps the listener osra adds until it aborts, one per request', async () => {
    const extension = await connect()
    const signals = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
      const { signal } = new AbortController()
      await new Response(await extension.fetch(`r${index}`, { signal })).text()
      return signal
    }))
    expect(listenersOf(signals)).toBe(20)
  })

  it('is let go once each answer is read to its end, fails, is cancelled or has no body', async () => {
    const extension = await connect()
    const outcomes = ['read', 'cancelled', 'empty', 'broken', 'read'] as const
    const signals = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
      const outcome = outcomes[index % outcomes.length]!
      const abort = new AbortController()
      const body = await extension.fetch(outcome === 'empty' || outcome === 'broken' ? outcome : `r${index}`, { signal: abort.signal })
      const response = releaseWhenOver(answer(body), () => abort.abort())
      if (outcome === 'read') expect(await new Response(response?.body).text()).toBe(`answer to r${index}`)
      if (outcome === 'cancelled') await response?.body?.cancel()
      if (outcome === 'broken') await expect(new Response(response?.body).text()).rejects.toThrow('upstream dropped')
      return abort.signal
    }))
    expect(listenersOf(signals)).toBe(0)
  })

  it('stays live while its answer is still being read, so a cancel still reaches the extension', async () => {
    let released = 0
    const response = releaseWhenOver(answer(new Response('abc').body), () => { released += 1 })
    const reader = response!.body!.getReader()
    expect((await reader.read()).done).toBe(false)
    expect(released).toBe(0)
    expect((await reader.read()).done).toBe(true)
    expect(released).toBe(1)
  })
})

describe('the extension fetch port', () => {
  it('lets each request\'s signal go once its answer is read, and at once when the extension refuses it', async () => {
    const extension = await connect()
    const signals: AbortSignal[] = []
    const { port1, port2 } = new MessageChannel()
    serveExtFetch(port1, async (request, signal) => {
      signals.push(signal)
      return answer(await extension.fetch(request.url, { signal }))
    })
    const answers = new Map<number, (response: ExtFetchResponse) => void>()
    port2.addEventListener('message', (event: MessageEvent<ExtFetchResponse>) => answers.get(event.data.id)?.(event.data))
    port2.start()
    const ask = (id: number, url: string) => new Promise<ExtFetchResponse>((resolve) => {
      answers.set(id, resolve)
      port2.postMessage({ type: 'fetch', id, url, options: {} } satisfies ExtFetchRequest)
    })
    const texts = await Promise.all(Array.from({ length: 20 }, async (_, id) => {
      const reply = await ask(id, id % 4 === 3 ? 'refused' : `r${id}`)
      return reply.error ?? await new Response(reply.response?.body).text()
    }))
    expect(texts.filter((text) => text.startsWith('answer to'))).toHaveLength(15)
    expect(texts.filter((text) => text.includes('extension refused the request'))).toHaveLength(5)
    expect(signals).toHaveLength(20)
    expect(listenersOf(signals)).toBe(0)
    port1.close()
    port2.close()
  })
})

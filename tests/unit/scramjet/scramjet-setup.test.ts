import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { scramjetWorker } from '../../../src/scramjet/scramjet-setup'

const SCRIPT = 'https://youtube.fkn.app/__yt_scramjet__/sw.js'

type Worker = { scriptURL: string }

// register() as Chrome answers it on a return visit while its own update check of the worker waits to start
const stubWorkers = (controller: Worker | null, register: () => Promise<unknown> = () => new Promise(() => {})) => {
  const registered = vi.fn(register)
  vi.stubGlobal('location', new URL('https://youtube.fkn.app/__yt_scramjet__/host'))
  vi.stubGlobal('navigator', { serviceWorker: { controller, register: registered } })
  return registered
}

const settled = <T>(promise: Promise<T>) =>
  Promise.race([promise, new Promise<string>((resolve) => setTimeout(() => resolve('still waiting on register()'), 100))])

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('scramjetWorker', () => {
  it('takes the worker that already controls the page without waiting on register()', async () => {
    const controller = { scriptURL: SCRIPT }
    const register = stubWorkers(controller)
    await expect(settled(scramjetWorker())).resolves.toBe(controller)
    expect(register).not.toHaveBeenCalled()
  })

  it('registers the worker when nothing controls the page yet', async () => {
    const active = { scriptURL: SCRIPT }
    const register = stubWorkers(null, async () => ({ active }))
    await expect(settled(scramjetWorker())).resolves.toBe(active)
    expect(register).toHaveBeenCalledWith('/__yt_scramjet__/sw.js', expect.objectContaining({ scope: '/__yt_scramjet__/' }))
  })

  it('registers the worker when another worker controls the page', async () => {
    const active = { scriptURL: SCRIPT }
    const register = stubWorkers({ scriptURL: 'https://youtube.fkn.app/sw.js' }, async () => ({ active }))
    await expect(settled(scramjetWorker())).resolves.toBe(active)
    expect(register).toHaveBeenCalledOnce()
  })
})

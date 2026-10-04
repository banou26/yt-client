import { describe, expect, it } from 'vite-plus/test'

import * as lib from '@fkn/lib'
import * as net from '@fkn/lib/net'

// the installed @fkn/lib, not a mock: platform.ts and egress.worker.ts read these by name, and the lib ships breaking renames as patches
describe('the @fkn/lib surface this client reads', () => {
  // platform.ts enables cookie forging off this probe, so a lib that stops exporting it at the root silently tunnels every signed-in request
  it('exports FORGEABLE_HEADERS at the root with cookie on it', () => {
    expect(((lib as { FORGEABLE_HEADERS?: string[] }).FORGEABLE_HEADERS ?? []).includes('cookie')).toBe(true)
  })

  // platform.ts awaits it: called bare, a rejection from an async relayWorker goes unhandled and the start reports success
  it('has an async relayWorker that rejects outside a window realm', async () => {
    await expect(lib.relayWorker({} as Worker)).rejects.toThrow(/main thread/)
  })

  it('has the calls the app realm and the egress worker make', () => {
    expect(typeof lib.extension.fetch).toBe('function')
    expect(typeof lib.isExtensionExposed).toBe('function')
    expect(typeof lib.setMissingExtensionHandler).toBe('function')
    expect(typeof lib.promptInstall).toBe('function')
    expect(typeof lib.fetch).toBe('function')
    expect(typeof net.connect).toBe('function')
  })
})

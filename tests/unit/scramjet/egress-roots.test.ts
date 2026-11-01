import { createHash } from 'node:crypto'
import { expect, it } from 'vite-plus/test'

import bundle from 'libcurl.js/bundled?raw'

import { CHROME_ROOT_STORE } from '../fixtures/chrome-root-store'

type CurlExports = { init_curl(): void, get_cacert(): number, memory: WebAssembly.Memory }

/* The roots the egress worker's libcurl checks an upstream's certificate against, read from the wasm inside the bundle
   it imports. That bundle's glue refuses to start under Node, so the wasm runs bare with every import a no-op: init_curl
   builds the PEM it hands curl from the certificates compiled in, and get_cacert returns it. */
const bundledRoots = async () => {
  const [, base64] = /data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/.exec(bundle) ?? []
  const module = await WebAssembly.compile(Buffer.from(base64 ?? '', 'base64'))
  const imports: Record<string, Record<string, () => number>> = {}
  for (const { module: space, name } of WebAssembly.Module.imports(module)) (imports[space] ??= {})[name] = () => 0
  const curl = (await WebAssembly.instantiate(module, imports)).exports as CurlExports
  curl.init_curl()
  const memory = new Uint8Array(curl.memory.buffer, curl.get_cacert())
  const pem = new TextDecoder().decode(memory.subarray(0, memory.indexOf(0)))
  return new Set(
    [...pem.matchAll(/-----BEGIN CERTIFICATE-----([^-]+)-----END CERTIFICATE-----/g)].map(([, cert]) =>
      createHash('sha256').update(Buffer.from(cert ?? '', 'base64')).digest('hex'),
    ),
  )
}

// libcurl.js 0.7.4 lacked e-Szigno TLS Root CA 2023, so a site under it failed in the egress and loaded in Chrome
it('the egress trusts every root Chrome trusts', async () => {
  const trusted = await bundledRoots()
  expect(CHROME_ROOT_STORE.filter(([sha256]) => !trusted.has(sha256)).map(([, name]) => name)).toEqual([])
})

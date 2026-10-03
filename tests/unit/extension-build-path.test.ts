/// <reference types="vite/client" />
import { describe, expect, it } from 'vite-plus/test'

import { extensionBuild } from '../browser/extension-build'
import spec from '../browser/extension-egress.spec.ts?raw'

const BUILD = '/work/fkn-client/web-extension/build'
const built = (path: string) => path === `${BUILD}/manifest.json`

describe('the extension spec finds its build through YT_EXTENSION_BUILD', () => {
  it('with YT_EXTENSION_BUILD unset and no opt-out, the extension spec\'s build lookup throws instead of skipping; an explicit YT_EXTENSION_BUILD=skip:<reason> skips and names the reason', () => {
    expect(() => extensionBuild({}, built)).toThrow(/YT_EXTENSION_BUILD is unset/)
    expect(() => extensionBuild({ YT_EXTENSION_BUILD: '  ' }, built)).toThrow(/YT_EXTENSION_BUILD is unset/)
    expect(extensionBuild({ YT_EXTENSION_BUILD: 'skip: no extension build on this runner' }, built))
      .toEqual({ skip: 'no extension build on this runner' })
    expect(() => extensionBuild({ YT_EXTENSION_BUILD: 'skip:' }, built)).toThrow(/names no reason/)
  })

  it('a path that holds no build fails, and a built one is what the spec loads', () => {
    expect(() => extensionBuild({ YT_EXTENSION_BUILD: '/home/banou/dev/fkn/web-extension/build' }, built))
      .toThrow(/holds no manifest\.json/)
    expect(() => extensionBuild({ YT_EXTENSION_BUILD: 'web-extension/build' }, built)).toThrow(/not an absolute path/)
    expect(extensionBuild({ YT_EXTENSION_BUILD: BUILD }, built)).toEqual({ path: BUILD })
  })

  it('the spec takes its build from the lookup, and skips only on its named reason', () => {
    expect(spec).toMatch(/import \{ extensionBuild \} from '\.\/extension-build'/)
    expect(spec).toMatch(/extensionBuild\(process\.env\)/)
    expect(spec).toMatch(/\{ path: build\.path \}/)
    expect(spec.match(/test\.skip\(/g)).toHaveLength(1)
    expect(spec).toMatch(/test\.skip\(build\.skip !== undefined,/)
    expect(spec).not.toMatch(/\/home\/banou\/dev\/fkn\//)
  })
})

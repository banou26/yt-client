import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

export type ExtensionBuild = { path: string, skip?: undefined } | { path?: undefined, skip: string }

/** Where the extension spec loads the unpacked FKN extension from: `YT_EXTENSION_BUILD`, an absolute path
 * to a Chromium build (fkn-client's `web-extension/build`). Unset, relative or without a manifest.json, it
 * throws, so the spec fails rather than skipping; the only way to skip is `YT_EXTENSION_BUILD=skip:<reason>`,
 * which names why. */
export const extensionBuild = (
  env: Record<string, string | undefined>,
  exists: (path: string) => boolean = existsSync,
): ExtensionBuild => {
  const value = env.YT_EXTENSION_BUILD?.trim()
  if (value?.startsWith('skip:')) {
    const reason = value.slice('skip:'.length).trim()
    if (!reason) throw new Error('YT_EXTENSION_BUILD=skip: names no reason; write it as skip:<reason>')
    return { skip: reason }
  }
  if (!value) {
    throw new Error(
      'YT_EXTENSION_BUILD is unset: set it to an unpacked Chromium build of the FKN extension '
        + "(fkn-client's web-extension/build), or to skip:<reason>",
    )
  }
  if (!isAbsolute(value)) throw new Error(`YT_EXTENSION_BUILD=${value} is not an absolute path`)
  if (!exists(join(value, 'manifest.json'))) throw new Error(`YT_EXTENSION_BUILD=${value} holds no manifest.json`)
  return { path: value }
}

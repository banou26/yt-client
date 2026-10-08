/**
 * The id of this build, shared by the app realm and the engine host it serves, and new on every build.
 *
 * The engine host and its frame bundle load from fixed paths (`/__yt_scramjet__/host.html`,
 * `youtube-frame.js`), so a tab opened before a deploy gets the NEW engine on its next reset while
 * its app realm stays OLD. Both ends name their build in `HOST_HELLO` and `HOST_BOOTSTRAP`, and a
 * pair that differs never connects: the app realm reloads instead of calling a protocol the frame no
 * longer serves.
 */
export const BUILD_ID: string = __YT_BUILD_ID__

/** The error an engine from another build answers with, in `ENGINE_READY` or on the app's own check. */
export const ENGINE_BUILD_MISMATCH = 'yt-client: the engine is from another build'

const RELOAD_KEY = 'yt-client:engine-build-reload'

/**
 * Reloads the page to take the engine's build, at most once per pair of builds, and answers whether
 * it did. A reload that lands on the same pair again (a cache still serving one side) fails as an
 * engine error rather than looping, and so does a tab whose session storage cannot be written.
 */
export const reloadOnceForBuild = (engineBuild: unknown, reload = () => location.reload()) => {
  const pair = `${BUILD_ID} ${typeof engineBuild === 'string' ? engineBuild : 'unnamed'}`
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === pair) return false
    sessionStorage.setItem(RELOAD_KEY, pair)
  } catch {
    return false
  }
  reload()
  return true
}

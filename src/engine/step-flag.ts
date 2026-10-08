/**
 * Whether a migration step is turned on in this browser: `localStorage['yt-client:step:<step>']`
 * set to '1' on the app's origin, read when an engine starts. Off by default, and off when storage
 * cannot be read, so a step is reachable only by someone who sets it.
 */
export const stepEnabled = (step: 'y1') => {
  try {
    return localStorage.getItem(`yt-client:step:${step}`) === '1'
  } catch {
    return false
  }
}

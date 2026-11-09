/**
 * Whether a migration step is on in this browser, read when an engine starts. Y1 and the direct lane are on by default;
 * `localStorage['yt-client:step:<step>']` set to '0' on the app's origin turns one off, a switch kept for one release.
 * On when storage cannot be read.
 */
export const stepEnabled = (step: 'y1' | 'direct') => {
  try {
    return localStorage.getItem(`yt-client:step:${step}`) !== '0'
  } catch {
    return true
  }
}

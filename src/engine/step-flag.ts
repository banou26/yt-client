/**
 * Whether a migration step is on in this browser, read when an engine starts. Y1 is on by default;
 * `localStorage['yt-client:step:y1']` set to '0' on the app's origin turns it off, a switch kept for
 * one release. On when storage cannot be read.
 */
export const stepEnabled = (step: 'y1') => {
  try {
    return localStorage.getItem(`yt-client:step:${step}`) !== '0'
  } catch {
    return true
  }
}

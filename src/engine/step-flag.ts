const ON_BY_DEFAULT = { y1: true, direct: false } as const

/**
 * Whether a migration step is on in this browser, read when an engine starts from
 * `localStorage['yt-client:step:<step>']` on the app's origin. Y1 is on by default and '0' turns it off, a switch kept
 * for one release. The direct lane is off by default and '1' turns it on. Storage that cannot be read leaves each at
 * its default.
 */
export const stepEnabled = (step: keyof typeof ON_BY_DEFAULT) => {
  try {
    const value = localStorage.getItem(`yt-client:step:${step}`)
    return ON_BY_DEFAULT[step] ? value !== '0' : value === '1'
  } catch {
    return ON_BY_DEFAULT[step]
  }
}

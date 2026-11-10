let waiting: string[] = []

const warm = () => {
  const batch = waiting
  waiting = []
  return Promise.allSettled(batch.map(href => fetch(href, { priority: 'low' })
    .then(response => response.ok ? response.arrayBuffer() : Promise.reject(response.status))
    .then(() => {
      const link = document.createElement('link')
      link.rel = 'modulepreload'
      // as Vite writes its own, so its preload helper finds this one and adds none
      link.crossOrigin = ''
      link.href = href
      document.head.append(link)
    }, (status: unknown) => {
      if (status !== 404) waiting.push(href)
    })))
}

/**
 * Downloads each file of code in `hrefs` and adds it to the document without running it, so a page opened later still
 * has its code during a network drop, or after a deploy removed its files.
 *
 * Each file is fetched before its modulepreload link is added: Firefox and WebKit keep a failed modulepreload, or a
 * failed import, for the life of the document, while a failed fetch leaves nothing behind (measured 2026-11-10 in
 * Firefox 151 and WebKit 26.5). The link then reads the file from the HTTP cache the fetch filled. A failed file is
 * fetched again when the browser comes back online and every `retryMs`; one answering 404 (a deploy removed it) is not.
 */
export const warmLazyCode = (hrefs: readonly string[], retryMs = 30_000) => {
  waiting = [...hrefs]
  addEventListener('online', () => void warm())
  setInterval(() => {
    if (waiting.length > 0) void warm()
  }, retryMs)
  void warm()
}

/** The files the build listed in the app's `index.html` for `warmLazyCode`; none under the dev server. */
export const lazyCodeList = (): string[] => JSON.parse(document.getElementById('lazy-code')?.textContent ?? '[]')

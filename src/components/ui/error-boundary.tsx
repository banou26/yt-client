import type { ComponentChildren } from 'preact'

import { css } from '@emotion/react'
import { useEffect, useErrorBoundary, useLayoutEffect, useRef } from 'preact/hooks'

import { RouteLoadError } from '../lazy-route'

const style = css`
  max-width: 56rem;
  margin: 4.8rem auto;
  padding: 2.4rem;
  border-radius: 1.2rem;
  background: var(--bg-subtle);
  text-align: center;

  p {
    margin: 0 0 1.6rem;
    font-size: 1.4rem;
    color: var(--text-primary);
  }

  button {
    height: 3.6rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 1.8rem;
    background: var(--bg-inverse);
    color: var(--text-inverse);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
  }
`

export const OFFLINE_LINE = 'You\'re offline. Check your connection.'

export const FAILED_LINE = 'Something went wrong.'

// a try made the moment the browser comes back online can fail while the connection settles (a real drop, 2026-11-11:
// a search's try at 'online' failed, and Try again 30 s later loaded it), so a line that shows again this soon after
// 'online' tries again by itself
const SETTLE_MS = 30_000
const SETTLE_RETRY_MS = 3_000

let backOnlineAt = -Infinity
addEventListener('online', () => {
  backOnlineAt = Date.now()
})

/**
 * Runs `retry` by itself when the browser comes back online, as youtube.com does for a page it could not load, and every
 * 3 s while that try fails in the 30 s after it. For a failure line: call it from the component that shows the line, so
 * it runs only while the line shows, and that component mounts again each time a try fails.
 */
export const useRetryWhenOnline = (retry: () => void, enabled = true) => {
  const latest = useRef(retry)
  latest.current = retry
  // one listener for the line's life: one swapped by a render that an earlier 'online' listener caused is skipped for
  // that event (a watch page's comments missed their retry that way), and a layout effect, because a plain one waits
  // for a paint and misses a connection that comes back as the line shows
  useLayoutEffect(() => {
    if (!enabled) return
    const onOnline = () => latest.current()
    addEventListener('online', onOnline)
    return () => removeEventListener('online', onOnline)
  }, [enabled])

  useEffect(() => {
    if (!enabled || !navigator.onLine || Date.now() - backOnlineAt > SETTLE_MS) return
    const timer = setTimeout(() => latest.current(), SETTLE_RETRY_MS)
    return () => clearTimeout(timer)
  }, [enabled])
}

/**
 * A failed page or failed data: `line` and a Try again button that calls `retry`. With `whenOnline`, `retry` also runs
 * by itself as useRetryWhenOnline says.
 */
export const Failure = ({ line, retry, whenOnline = false }: { line: string, retry: () => void, whenOnline?: boolean }) => {
  useRetryWhenOnline(retry, whenOnline)

  return (
    <div css={style} role='alert'>
      <p>{line}</p>
      <button type='button' onClick={retry}>Try again</button>
    </div>
  )
}

export const ErrorBoundary = ({ children }: { children: ComponentChildren }) => {
  const [error, reset] = useErrorBoundary(caught => console.error('yt-client: the page failed', caught))

  if (!error) return <>{children}</>

  const loadFailed = error instanceof RouteLoadError
  return <Failure line={loadFailed ? OFFLINE_LINE : FAILED_LINE} retry={reset} whenOnline={loadFailed} />
}

export default ErrorBoundary

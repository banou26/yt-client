import type { ComponentChildren } from 'preact'

import { css } from '@emotion/react'
import { useErrorBoundary, useLayoutEffect } from 'preact/hooks'

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

export const ErrorBoundary = ({ children }: { children: ComponentChildren }) => {
  const [error, reset] = useErrorBoundary(caught => console.error('yt-client: the page failed', caught))
  const loadFailed = error instanceof RouteLoadError

  // youtube.com retries its offline page by itself once the browser is back online; a layout effect, because a plain
  // one waits for a paint and misses a connection that comes back as the line shows
  useLayoutEffect(() => {
    if (!loadFailed) return
    addEventListener('online', reset)
    return () => removeEventListener('online', reset)
  }, [loadFailed, reset])

  if (!error) return <>{children}</>

  return (
    <div css={style} role='alert'>
      <p>{loadFailed ? 'You\'re offline. Check your connection.' : 'Something went wrong.'}</p>
      <button type='button' onClick={reset}>Try again</button>
    </div>
  )
}

export default ErrorBoundary

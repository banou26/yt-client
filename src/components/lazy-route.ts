import type { ComponentType } from 'preact'

import { h } from 'preact'

/** What a route made by `lazyRoute` throws to the error boundary when its code failed to download. */
export class RouteLoadError extends Error {}

/**
 * `lazy` from preact/compat for a route, except that a failed import is forgotten once it has been thrown, so the next
 * render (Try again, coming back online, visiting the route again) imports it again. preact's own keeps the first
 * failure for the life of the page.
 */
export const lazyRoute = <Page>(load: () => Promise<{ default: Page }>): Page => {
  let component: Page | undefined
  let loading: Promise<void> | undefined
  let failure: RouteLoadError | undefined

  const Route = (props: object) => {
    if (component) return h(component as ComponentType, props)
    if (failure) {
      const error = failure
      failure = undefined
      loading = undefined
      throw error
    }
    loading ??= load().then(
      module => {
        component = module.default
      },
      (cause: unknown) => {
        failure = new RouteLoadError(cause instanceof Error ? cause.message : String(cause), { cause })
      },
    )
    throw loading
  }
  return Route as Page
}

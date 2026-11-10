import type { CombinedError, UseQueryExecute } from 'urql'

import { FAILED_LINE, Failure, OFFLINE_LINE, useRetryWhenOnline } from './ui/error-boundary'
import { MenuItem } from './ui/menu'

// how a request that the connection failed ends: no answer, a server error, or an answer cut short. Chrome's and
// Firefox's wordings were measured in a real network drop, 2026-11-10 ("failed with status code 500", "JSON.parse:
// ..."); Safari's "Load failed" is its known message for no answer, not measured
const CONNECTION_FAILED = /status code 5\d\d|fetch|network|load failed|JSON/i

/**
 * The one line a failed request shows, never the request's own text: youtube.com's offline line when the connection
 * failed it, a plain line otherwise. What DataFailure says, and what a failed action says in its toast.
 */
export const lineFor = (error: CombinedError) => !navigator.onLine || CONNECTION_FAILED.test(error.message) ? OFFLINE_LINE : FAILED_LINE

/**
 * What a page shows in place of its data when the query failed: youtube.com's offline line when the request did (it
 * shows that line for any page whose data request failed, a server error included), a plain line otherwise, and Try
 * again, which also runs by itself once the browser comes back online. `reexecute` is the query's own, from
 * `useQuery`. Render it only while the query is not fetching, so a new try shows the page's loading state instead.
 */
export const DataFailure = ({ error, reexecute }: { error: CombinedError, reexecute: UseQueryExecute }) => (
  <Failure line={lineFor(error)} retry={() => reexecute({ requestPolicy: 'network-only' })} whenOnline />
)

/**
 * DataFailure as a menu row: the same line, which tries again by itself once the browser comes back online, with no
 * Try again of its own, since the menu reads its data again when it is opened again, as youtube.com's do. Render it
 * only while the query is not fetching.
 */
export const MenuDataFailure = ({ error, reexecute }: { error: CombinedError, reexecute: UseQueryExecute }) => {
  useRetryWhenOnline(() => reexecute({ requestPolicy: 'network-only' }))
  return <MenuItem label={lineFor(error)} disabled />
}

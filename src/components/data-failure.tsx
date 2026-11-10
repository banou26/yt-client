import type { CombinedError, UseQueryExecute } from 'urql'

import { FAILED_LINE, Failure, OFFLINE_LINE } from './ui/error-boundary'

// how a request that the connection failed ends: no answer, a server error, or an answer cut short. Chrome's and
// Firefox's wordings were measured in a real network drop, 2026-11-10 ("failed with status code 500", "JSON.parse:
// ..."); Safari's "Load failed" is its known message for no answer, not measured
const CONNECTION_FAILED = /status code 5\d\d|fetch|network|load failed|JSON/i

/**
 * What a page shows in place of its data when the query failed: youtube.com's offline line when the request did (it
 * shows that line for any page whose data request failed, a server error included), a plain line otherwise, and Try
 * again, which also runs by itself once the browser comes back online. `reexecute` is the query's own, from
 * `useQuery`. Render it only while the query is not fetching, so a new try shows the page's loading state instead.
 */
export const DataFailure = ({ error, reexecute }: { error: CombinedError, reexecute: UseQueryExecute }) => (
  <Failure
    line={!navigator.onLine || CONNECTION_FAILED.test(error.message) ? OFFLINE_LINE : FAILED_LINE}
    retry={() => reexecute({ requestPolicy: 'network-only' })}
    whenOnline
  />
)

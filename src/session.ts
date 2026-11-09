import { useEffect, useState } from 'preact/hooks'
import { useQuery } from 'urql'

import { gql } from './generated'

const SESSION_QUERY = gql(`
  query Session {
    session {
      signedIn
      name
      avatar
      handle
      accounts { brandPageId name avatar handle selected hasChannel }
    }
  }
`)

export type SessionAccount = {
  brandPageId?: string
  name?: string
  avatar?: string
  handle?: string
  selected?: boolean
  hasChannel?: boolean
}

/** Which row a switch is going to: the channel's page ID, or '' for the account's own channel, which has none. */
export const channelKey = (account: SessionAccount) => account.brandPageId ?? ''

/** A channel handle as youtube.com shows it, with the leading @ added when the answer left it out. */
export const atHandle = (handle: string) => handle.startsWith('@') ? handle : `@${handle}`

export type SessionState = {
  signedIn: boolean
  name?: string
  avatar?: string
  handle?: string
  accounts: SessionAccount[]
  ready: boolean
}

const useEngineReady = () => {
  const [ready, setReady] = useState(() => document.documentElement.dataset.engine === 'ready')

  useEffect(() => {
    if (ready) return
    const check = () => {
      if (document.documentElement.dataset.engine !== 'ready') return
      setReady(true)
      observer.disconnect()
    }
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-engine'] })
    check()
    return () => observer.disconnect()
  }, [ready])

  return ready
}

// `ready` must cover the whole probe, not just the engine gate, or a caller shows "sign in" to a signed-in user for one round trip
/**
 * Shared identity for every view that branches on being signed in.
 *
 * `ready` covers the whole probe, not just the engine gate: a caller that
 * renders a signed-out state the moment the engine comes up would show "sign
 * in" to a signed-in user for one full round trip. Every caller selects the
 * same fields off `Query.session`, so the normalized cache answers all of them
 * from whichever fetch lands first.
 */
export const useSession = (): SessionState => {
  const engineReady = useEngineReady()
  const [{ data, error }] = useQuery({ query: SESSION_QUERY, pause: !engineReady })
  const session = data?.session

  return {
    signedIn: session?.signedIn ?? false,
    name: session?.name ?? undefined,
    avatar: session?.avatar ?? undefined,
    handle: session?.handle ?? undefined,
    accounts: (session?.accounts ?? []).map((account) => ({
      brandPageId: account.brandPageId ?? undefined,
      name: account.name ?? undefined,
      avatar: account.avatar ?? undefined,
      handle: account.handle ?? undefined,
      selected: account.selected ?? undefined,
      hasChannel: account.hasChannel ?? undefined,
    })),
    ready: engineReady && (data !== undefined || error !== undefined),
  }
}

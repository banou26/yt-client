import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import type { SessionAccount } from '../../../src/session'

import AccountMenu from '../../../src/components/account-menu'
import AccountPage from '../../../src/routes/account'
import { BRAND_PAGE_ID, OTHER_PAGE_ID } from '../../unit/fixtures/accounts-list'

export type Selected = 'own' | 'brand'

// one Google account's channels, all named alike as two of the owner's were (measured 2026-11-06), told apart by handle
const channels = (selected: Selected, brands: number): SessionAccount[] => [
  { name: 'Viewer', handle: '@viewer', selected: selected === 'own' || undefined, hasChannel: true },
  { brandPageId: BRAND_PAGE_ID, name: 'Viewer', handle: '@viewer-brand', selected: selected === 'brand' || undefined, hasChannel: true },
  ...(brands > 1 ? [{ brandPageId: OTHER_PAGE_ID, name: 'Viewer', handle: '@viewer-other', hasChannel: true }] : []),
]

// above the app the harness is mounted on, whose fixed guide would take its clicks
const host = (name: string) => {
  const element = document.createElement('div')
  element.setAttribute('data-account-harness', name)
  element.style.cssText = 'position: fixed; inset: 6rem 2rem auto auto; z-index: 10000; width: 60rem; background: var(--bg)'
  document.body.append(element)
  return element
}

// served by the dev server and imported from a spec: the account menu over fixed channels
export const mountAccountMenu = (selected: Selected, brands = 1) => {
  const accounts = channels(selected, brands)
  const current = accounts.find((account) => account.selected)!
  render(<AccountMenu name={current.name} handle={current.handle} accounts={accounts} />, host('menu'))
}

// the /account page against a fixed Session answer
export const mountAccountPage = (selected: Selected, brands = 1) => {
  const accounts = channels(selected, brands)
  const current = accounts.find((account) => account.selected)!
  const session = {
    signedIn: true,
    name: current.name,
    avatar: null,
    handle: current.handle,
    accounts: accounts.map((account) => ({
      brandPageId: account.brandPageId ?? null,
      name: account.name,
      avatar: null,
      handle: account.handle,
      selected: account.selected ?? null,
      hasChannel: true,
    })),
  }
  const client = new Client({
    url: '/account-harness',
    exchanges: [fetchExchange],
    fetch: async () => new Response(JSON.stringify({ data: { session } }), { headers: { 'content-type': 'application/json' } }),
    preferGetMethod: false,
  })
  // useSession reads only once the engine is up
  document.documentElement.dataset.engine = 'ready'
  render(<Provider value={client}><AccountPage /></Provider>, host('page'))
}

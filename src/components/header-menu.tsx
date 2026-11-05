import type { ThemePreference } from '../settings'

import { css } from '@emotion/react'
import { Check, ChevronLeft, ChevronRight, EllipsisVertical, LockKeyholeOpen, LogIn, LogOut, Moon, Settings } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { useLocation } from 'wouter'

import { FKN_BOUND_MS, within } from '../groups/sync'
import { checkGroups, fknLib, readFkn } from '../groups/sync-live'
import { getSettings, updateSettings } from '../settings'
import { Menu, MenuItem, MenuSeparator } from './ui/menu'
import { showToast } from './ui/toast'

const THEME_LABELS: Record<ThemePreference, string> = {
  device: 'Device theme',
  dark: 'Dark theme',
  light: 'Light theme',
}

const THEME_ORDER: ThemePreference[] = ['device', 'dark', 'light']

const panelStyle = css`
  min-width: 28rem;
`

const Blank = ({ size = 20 }: { size?: number, strokeWidth?: number }) =>
  <span style={{ display: 'block', width: `${size}px`, height: `${size}px` }} aria-hidden='true' />

type FknState = NonNullable<Awaited<ReturnType<typeof readFkn>>>

/** Where this page stands with FKN, read when the menu opens; undefined until FKN answered. */
const useFkn = () => {
  const [state, setState] = useState<FknState>()
  useEffect(() => {
    let open = true
    void fknLib().then(readFkn).then((read) => {
      if (read && open) setState(read)
    }, () => {})
    return () => {
      open = false
    }
  }, [])
  return state
}

const recheck = () => void checkGroups().catch(() => {})

// login() and unlock() raise FKN's own card, so each is called straight from the click
const FknRows = ({ fkn: { lib, signedIn, locked } }: { fkn: FknState }) => {
  if (!signedIn) {
    return <MenuItem icon={LogIn} label='Sign in to FKN' onSelect={() => void lib.account.login().then(recheck, () => {})} />
  }
  return (
    <>
      {locked ? <MenuItem icon={LockKeyholeOpen} label='Unlock FKN storage' onSelect={() => void lib.fs.unlock().then(recheck, () => {})} /> : undefined}
      <MenuItem
        icon={LogOut}
        label='Sign out of FKN'
        onSelect={() => void within(FKN_BOUND_MS, () => lib.account.logout()).then(recheck, () => showToast('Could not sign out of FKN. Try again.'))}
      />
    </>
  )
}

const HeaderMenuPanel = () => {
  const [, navigate] = useLocation()
  const [view, setView] = useState<'root' | 'appearance'>('root')
  const [theme, setTheme] = useState(() => getSettings().theme)
  const fkn = useFkn()
  const panelRef = useRef<HTMLDivElement>(null)
  const shown = useRef(view)

  // Menu focuses a row only when it opens, so swapping views has to move focus itself
  useLayoutEffect(() => {
    if (shown.current === view) return
    shown.current = view
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [view])

  if (view === 'appearance') {
    return (
      <div css={panelStyle} role='presentation' ref={panelRef}>
        <MenuItem icon={ChevronLeft} label='Appearance' closeOnSelect={false} onSelect={() => setView('root')} />
        <MenuSeparator />
        {THEME_ORDER.map(option => (
          <MenuItem
            key={option}
            icon={option === theme ? Check : Blank}
            label={THEME_LABELS[option]}
            closeOnSelect={false}
            onSelect={() => {
              setTheme(option)
              updateSettings({ theme: option })
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div css={panelStyle} role='presentation' ref={panelRef}>
      <MenuItem
        icon={Moon}
        label={`Appearance: ${THEME_LABELS[theme]}`}
        trailingIcon={ChevronRight}
        closeOnSelect={false}
        onSelect={() => setView('appearance')}
      />
      <MenuSeparator />
      <MenuItem icon={Settings} label='Settings' onSelect={() => navigate('/settings')} />
      {fkn
        ? (
          <>
            <MenuSeparator />
            <FknRows fkn={fkn} />
          </>
        )
        : undefined}
    </div>
  )
}

/** The header's ⋮ button and its menu: the theme choice, a way to Settings, and signing in to or out of FKN. */
export const HeaderMenu = () => (
  <Menu
    label='More'
    trigger={
      <button type='button' className='icon-button' aria-label='More'>
        <EllipsisVertical size={24} strokeWidth={1.5} />
      </button>
    }
  >
    <HeaderMenuPanel />
  </Menu>
)

export default HeaderMenu

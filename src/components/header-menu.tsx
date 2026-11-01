import type { ThemePreference } from '../settings'

import { css } from '@emotion/react'
import { Check, ChevronLeft, ChevronRight, EllipsisVertical, Moon, Settings } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { useLocation } from 'wouter'

import { getSettings, updateSettings } from '../settings'
import { Menu, MenuItem, MenuSeparator } from './ui/menu'

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

const HeaderMenuPanel = () => {
  const [, navigate] = useLocation()
  const [view, setView] = useState<'root' | 'appearance'>('root')
  const [theme, setTheme] = useState(() => getSettings().theme)
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
    </div>
  )
}

/** The header's ⋮ button and its menu: the theme choice and a way to Settings. */
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

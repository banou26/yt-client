import { css } from '@emotion/react'
import { Bell, BellOff, BellRing, Check, ChevronDown } from 'lucide-react'
import { useCallback, useRef, useState } from 'preact/hooks'
import { useMutation } from 'urql'

import type { NotificationLevel } from '../generated/graphql'

import { gql } from '../generated'
import { lineFor } from './data-failure'
import { MenuItem, Popup, useDismiss } from './ui/popup'
import { showToast } from './ui/toast'
import { signIn } from '../sign-in'

// The mutation does not refetch the channel, so anything else would come back null
const SET_SUBSCRIBED = gql(`
  mutation SetSubscribed($channelId: ID!, $subscribed: Boolean!) {
    setSubscribed(channelId: $channelId, subscribed: $subscribed) {
      id
      isSubscribed
    }
  }
`)

const SET_NOTIFICATION_LEVEL = gql(`
  mutation SetNotificationLevel($channelId: ID!, $level: NotificationLevel!) {
    setNotificationLevel(channelId: $channelId, level: $level) {
      id
      notificationLevel
    }
  }
`)

/** Draws a `.subscribe` button inside it as this one, for a Subscribe that opens something else (a collaboration's). */
export const subscribeStyle = css`
  display: flex;
  align-items: center;
  gap: 0.8rem;

  .subscribe {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    height: 3.6rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 1.8rem;
    background: var(--bg-inverse);
    color: var(--text-inverse);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .subscribe:hover:not(:disabled) {
    background: var(--bg-inverse-hover);
  }

  .subscribe:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .subscribe.subscribed {
    background: var(--bg-chip);
    color: var(--text-primary);
  }

  .subscribe.subscribed:hover:not(:disabled) {
    background: var(--bg-chip-hover);
  }

  .bell {
    position: relative;
  }
`

/**
 * Subscribes to a channel or unsubscribes from it and says which in a toast, or the error. `toggle` resolves to whether
 * the account is now subscribed, or undefined on an error. Signing in first is the caller's.
 */
export const useToggleSubscription = () => {
  const [state, setSubscribed] = useMutation(SET_SUBSCRIBED)
  const toggle = async (channelId: string, subscribed: boolean) => {
    const result = await setSubscribed({ channelId, subscribed: !subscribed })
    if (result.error) {
      showToast(lineFor(result.error))
      return undefined
    }
    showToast(subscribed ? 'Unsubscribed' : 'Subscribed')
    return result.data?.setSubscribed.isSubscribed === true
  }
  return { fetching: state.fetching, toggle }
}

const LEVELS: { level: NotificationLevel, label: string, Icon: typeof Bell }[] = [
  { level: 'ALL', label: 'All', Icon: BellRing },
  { level: 'PERSONALIZED', label: 'Personalized', Icon: Bell },
  { level: 'NONE', label: 'None', Icon: BellOff },
]

export const SubscribeButton = (
  { channelId, subscribed, notificationLevel }: {
    channelId?: string
    subscribed?: boolean | null
    notificationLevel?: NotificationLevel | null
  },
) => {
  const { fetching: subscribing, toggle } = useToggleSubscription()
  const [levelState, setLevel] = useMutation(SET_NOTIFICATION_LEVEL)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const onClose = useCallback(() => setOpen(false), [])
  useDismiss({ open, onClose, rootRef, triggerRef })

  const pending = subscribing || levelState.fetching
  const isSubscribed = subscribed === true
  const level = LEVELS.find(entry => entry.level === notificationLevel) ?? LEVELS[1]!

  const onToggle = () => {
    if (!channelId) return
    // Signed-out reads leave isSubscribed absent, which is what distinguishes them
    if (subscribed === undefined || subscribed === null) {
      signIn()
      return
    }
    void toggle(channelId, isSubscribed)
  }

  const onLevel = (next: NotificationLevel) => {
    setOpen(false)
    if (!channelId || next === notificationLevel) return
    void setLevel({ channelId, level: next }).then((result) => {
      if (result.error) showToast(lineFor(result.error))
    })
  }

  return (
    <div css={subscribeStyle} ref={rootRef}>
      <button
        type='button'
        className={isSubscribed ? 'subscribe subscribed' : 'subscribe'}
        disabled={pending || !channelId}
        aria-pressed={isSubscribed}
        onClick={onToggle}
      >
        {isSubscribed ? <><Check size={18} strokeWidth={1.5} />Subscribed</> : 'Subscribe'}
      </button>
      {isSubscribed
        ? (
          <div className='bell'>
            <button
              ref={triggerRef}
              type='button'
              className='subscribe subscribed'
              aria-label={`Notifications: ${level.label}`}
              aria-haspopup='menu'
              aria-expanded={open}
              disabled={pending}
              onClick={() => setOpen(value => !value)}
            >
              <level.Icon size={18} strokeWidth={1.5} />
              <ChevronDown size={14} strokeWidth={1.5} />
            </button>
            {open
              ? (
                <Popup label='Notifications' align='start'>
                  {LEVELS.map(entry => (
                    <MenuItem
                      key={entry.level}
                      icon={entry.Icon}
                      selected={entry.level === level.level}
                      onSelect={() => onLevel(entry.level)}
                    >
                      {entry.label}
                    </MenuItem>
                  ))}
                </Popup>
              )
              : undefined}
          </div>
        )
        : undefined}
    </div>
  )
}

export default SubscribeButton

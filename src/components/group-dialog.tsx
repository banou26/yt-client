import type { Group, GroupChannel } from '../groups/store'

import { css } from '@emotion/react'
import { X } from 'lucide-react'
import { createPortal } from 'preact/compat'
import { useCallback, useId, useRef, useState } from 'preact/hooks'
import { useQuery } from 'urql'

import { gql } from '../generated'
import { DEFAULT_EMOJI, groupStore, NAME_LIMIT } from '../groups/store'
import { useSession } from '../session'
import { readable } from './format'
import Dialog from './ui/dialog'

// `all` pages the whole list, so it is asked only here and never by the guide, which keeps the first page
const GROUP_SUBSCRIPTIONS_QUERY = gql(`
  query GroupSubscriptions {
    subscribedChannels(all: true) {
      id
      name
      avatar
    }
  }
`)

const EMOJI = [
  DEFAULT_EMOJI, '⭐', '🎵', '🎮', '💻', '🎬', '📚', '🍳', '⚽', '🏀', '🚗', '✈️',
  '🔬', '🎨', '📰', '💼', '😂', '🐶', '🌱', '🏋️', '🎧', '🎤', '📷', '🛠️',
]

const style = css`
  display: flex;
  flex-direction: column;
  gap: 1.6rem;

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .field-label {
    font-size: 1.2rem;
    color: var(--text-secondary);
  }

  .text {
    height: 4rem;
    padding: 0 1.2rem;
    border: 1px solid var(--border-strong);
    border-radius: 0.8rem;
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 1.4rem;
  }

  .text:focus {
    outline: none;
    border-color: var(--accent-focus);
  }

  .emoji-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .emoji {
    width: 3.6rem;
    height: 3.6rem;
    border: 1px solid transparent;
    border-radius: 0.8rem;
    background: transparent;
    font-size: 2rem;
    line-height: 1;
    cursor: pointer;
  }

  .emoji:hover {
    background: var(--bg-hover);
  }

  .emoji[aria-checked='true'] {
    border-color: var(--text-primary);
    background: var(--bg-selected);
  }

  .channels {
    display: flex;
    flex-direction: column;
    max-height: 24rem;
    overflow-y: auto;
  }

  .channel {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    min-height: 4rem;
    font-size: 1.4rem;
    color: var(--text-primary);
  }

  label.channel {
    cursor: pointer;
  }

  .channel input {
    flex: none;
    width: 1.8rem;
    height: 1.8rem;
    margin: 0;
    accent-color: var(--accent);
  }

  .avatar {
    flex: none;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    object-fit: cover;
    background: var(--bg-chip);
  }

  .avatar.fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    font-weight: 500;
  }

  .channel-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remove {
    flex: none;
    width: 3.2rem;
    height: 3.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
  }

  .remove:hover {
    background: var(--bg-hover);
  }

  .status {
    font-size: 1.4rem;
    color: var(--text-secondary);
  }

  .row {
    display: flex;
    justify-content: flex-end;
    gap: 0.8rem;
  }

  .cancel,
  .save {
    height: 3.6rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 1.8rem;
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .cancel {
    background: transparent;
    color: var(--accent);
  }

  .cancel:hover {
    background: var(--accent-hover);
  }

  .save {
    background: var(--bg-inverse);
    color: var(--text-inverse);
  }

  .save:not(:disabled):hover {
    background: var(--bg-inverse-hover);
  }

  .save:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

const Avatar = ({ channel }: { channel: GroupChannel }) => (
  channel.avatar
    ? <img className='avatar' src={channel.avatar} alt='' loading='lazy' referrerpolicy='no-referrer' />
    : <span className='avatar fallback' aria-hidden='true'>{channel.name.slice(0, 1).toUpperCase()}</span>
)

const SubscriptionPicker = (
  { chosen, onToggle }: { chosen: GroupChannel[], onToggle: (channel: GroupChannel, included: boolean) => void },
) => {
  const [filter, setFilter] = useState('')
  const [{ data, error, fetching }] = useQuery({ query: GROUP_SUBSCRIPTIONS_QUERY })
  const query = filter.trim().toLowerCase()
  const channels = (data?.subscribedChannels ?? [])
    .filter(channel => channel.name.toLowerCase().includes(query))

  return (
    <div className='field'>
      <span className='field-label'>Your subscriptions</span>
      <input
        className='text'
        type='search'
        value={filter}
        placeholder='Filter'
        aria-label='Filter subscriptions'
        onInput={(event: Event) => setFilter((event.currentTarget as HTMLInputElement).value)}
      />
      {fetching ? <p className='status'>Loading…</p> : undefined}
      {error ? <p className='status'>{readable(error.message)}</p> : undefined}
      <div className='channels'>
        {channels.map(channel => {
          const entry = { id: channel.id, name: channel.name, avatar: channel.avatar ?? undefined }
          const checked = chosen.some(kept => kept.id === channel.id)
          return (
            <label key={channel.id} className='channel'>
              <input type='checkbox' checked={checked} onChange={() => onToggle(entry, !checked)} />
              <Avatar channel={entry} />
              <span className='channel-name'>{channel.name}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Creates a group, or edits `group`: its name, its icon and its channels. A new group starts with `channels`.
 * `onSaved` gets the group as stored, after the dialog has asked to close.
 */
export const GroupDialog = (
  { group, channels: initialChannels = [], onClose, onSaved }: {
    group?: Group
    channels?: GroupChannel[]
    onClose: () => void
    onSaved?: (group: Group) => void
  },
) => {
  const { signedIn } = useSession()
  const iconLabel = useId()
  // Dialog re-runs its focus effect whenever onClose changes, which would pull focus out of the field being typed in
  const latestClose = useRef(onClose)
  latestClose.current = onClose
  const close = useCallback(() => latestClose.current(), [])
  const [name, setName] = useState(group?.name ?? '')
  const [emoji, setEmoji] = useState(group?.emoji ?? DEFAULT_EMOJI)
  const [channels, setChannels] = useState(group?.channels ?? initialChannels)
  const [choices] = useState(() => EMOJI.includes(emoji) ? EMOJI : [emoji, ...EMOJI])

  const onToggle = (channel: GroupChannel, included: boolean) => setChannels(current => included
    ? [...current.filter(kept => kept.id !== channel.id), channel]
    : current.filter(kept => kept.id !== channel.id))

  const onSubmit = (event: Event) => {
    event.preventDefault()
    if (name.trim().length === 0) return
    const fields = { name, emoji, channels }
    let saved: Group | undefined
    if (group) {
      groupStore.updateGroup(group.id, fields)
      saved = groupStore.getGroups().find(kept => kept.id === group.id)
    } else {
      saved = groupStore.createGroup(fields)
    }
    close()
    if (saved) onSaved?.(saved)
  }

  // portalled: it opens from the guide and the channel header, whose own `.avatar` and `.item` rules would reach into it
  return createPortal(
    <Dialog title={group ? 'Edit group' : 'New group'} onClose={close}>
      <form css={style} onSubmit={onSubmit}>
        <label className='field'>
          <span className='field-label'>Name</span>
          <input
            className='text'
            type='text'
            value={name}
            maxLength={NAME_LIMIT}
            onInput={(event: Event) => setName((event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <div className='field'>
          <span className='field-label' id={iconLabel}>Icon</span>
          <div className='emoji-row' role='radiogroup' aria-labelledby={iconLabel}>
            {choices.map(choice => (
              <button
                key={choice}
                type='button'
                className='emoji'
                role='radio'
                aria-checked={choice === emoji}
                aria-label={choice}
                onClick={() => setEmoji(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
        <div className='field'>
          <span className='field-label'>Channels</span>
          {channels.length === 0 ? <p className='status'>No channels</p> : undefined}
          <div className='channels'>
            {channels.map(channel => (
              <div key={channel.id} className='channel'>
                <Avatar channel={channel} />
                <span className='channel-name'>{channel.name}</span>
                <button
                  type='button'
                  className='remove'
                  aria-label={`Remove ${channel.name}`}
                  onClick={() => onToggle(channel, false)}
                >
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        </div>
        {signedIn ? <SubscriptionPicker chosen={channels} onToggle={onToggle} /> : undefined}
        <div className='row'>
          <button type='button' className='cancel' onClick={close}>Cancel</button>
          <button type='submit' className='save' disabled={name.trim().length === 0}>
            {group ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Dialog>,
    document.body,
  )
}

export default GroupDialog

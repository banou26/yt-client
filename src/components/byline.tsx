import type { ComponentChildren } from 'preact'

import type { BylinePart, Channel } from '../generated/graphql'

import { css } from '@emotion/react'
import { ChevronRight } from 'lucide-react'
import { Fragment } from 'preact'
import { createPortal } from 'preact/compat'
import { useCallback, useState } from 'preact/hooks'
import { Link } from 'wouter'

import { Dialog } from './ui/dialog'
import { VerifiedBadge } from './verified-badge'

export type Collaborator =
  Pick<Channel, 'id' | 'name'>
  & Partial<Pick<Channel, 'avatar' | 'handle' | 'subscriberCountText' | 'isVerified' | 'isVerifiedArtist'>>

export type CollaborationData = {
  byline?: Pick<BylinePart, 'text' | 'isVerified' | 'isVerifiedArtist'>[] | null
  collaborators?: Collaborator[] | null
}

const buttonStyle = css`
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  text-align: start;
  cursor: pointer;
`

const stackStyle = css`
  display: inline-flex;
  flex: none;

  & > * {
    width: var(--avatar-size, 2.4rem);
    height: var(--avatar-size, 2.4rem);
    border-radius: 50%;
    object-fit: cover;
    background: var(--bg-chip);
    box-shadow: 0 0 0 0.2rem var(--bg-base);
  }

  & > * + * {
    margin-left: calc(var(--avatar-size, 2.4rem) / -3);
  }
`

const dialogStyle = css`
  margin: 0;
  padding: 0;
  list-style: none;

  a {
    display: flex;
    align-items: center;
    gap: 1.6rem;
    margin: 0 -1.2rem;
    padding: 0.8rem 1.2rem;
    border-radius: 0.8rem;
    color: var(--text-primary);
  }

  a:hover {
    background: var(--bg-hover);
  }

  img,
  .initial {
    flex: none;
    width: 4rem;
    height: 4rem;
    border-radius: 50%;
    object-fit: cover;
    background: var(--bg-chip);
  }

  .initial {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.6rem;
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .name {
    font-size: 1.6rem;
    font-weight: 500;
  }

  .detail {
    font-size: 1.2rem;
    color: var(--text-secondary);
  }
`

const Avatar = ({ channel }: { channel: Collaborator }) => channel.avatar
  ? <img src={channel.avatar} alt='' loading='lazy' />
  : <span className='initial' aria-hidden='true'>{channel.name.slice(0, 1).toUpperCase()}</span>

/** A collaboration's names as youtube.com prints them ('Cleo Abram', 'and Marques Brownlee'), each with its badge. */
export const BylineNames = ({ parts, badgeSize }: { parts: CollaborationData['byline'], badgeSize?: number }) => (
  <>
    {(parts ?? []).map((part, index) => (
      <Fragment key={index}>
        {index > 0 ? ' ' : undefined}
        {part.text}
        <VerifiedBadge channel={part} size={badgeSize} />
      </Fragment>
    ))}
  </>
)

/** The first two channels' avatars, overlapped as youtube.com stacks a collaboration's; `--avatar-size` sizes them. */
export const AvatarStack = ({ channels }: { channels: Collaborator[] }) => (
  <span css={stackStyle} aria-hidden='true'>
    {channels.slice(0, 2).map(channel => <Avatar key={channel.id} channel={channel} />)}
  </span>
)

const CollaboratorsDialog = ({ channels, onClose }: { channels: Collaborator[], onClose: () => void }) => (
  <Dialog title='Collaborators' onClose={onClose}>
    <ul css={dialogStyle}>
      {channels.map(channel => (
        <li key={channel.id}>
          <Link href={`/channel/${channel.id}`} onClick={onClose}>
            <Avatar channel={channel} />
            <span className='text'>
              <span className='name'>{channel.name}<VerifiedBadge channel={channel} /></span>
              <span className='detail'>{[channel.handle, channel.subscriberCountText].filter(Boolean).join(' • ')}</span>
            </span>
            <ChevronRight size={24} strokeWidth={1.5} aria-hidden='true' />
          </Link>
        </li>
      ))}
    </ul>
  </Dialog>
)

/** A collaboration's avatars, which open the choice of its channels as youtube.com's do. */
export const CollaboratorsButton = (
  { channels, className, label, children }: {
    channels: Collaborator[]
    className: string
    label?: string
    children: ComponentChildren
  },
) => {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button type='button' css={buttonStyle} className={className} aria-label={label} aria-haspopup='dialog' onClick={() => setOpen(true)}>
        {children}
      </button>
      {/* portalled: a card's own `.avatar` and `.name` rules would reach into it */}
      {open ? createPortal(<CollaboratorsDialog channels={channels} onClose={close} />, document.body) : undefined}
    </>
  )
}

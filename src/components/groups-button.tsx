import type { Group, GroupChannel } from '../groups/store'

import { css } from '@emotion/react'
import { FolderCheck, FolderPlus, Plus } from 'lucide-react'
import { useState } from 'preact/hooks'

import { groupStore, useGroups } from '../groups/store'
import GroupDialog from './group-dialog'
import { Menu, MenuItem, MenuSeparator } from './ui/menu'
import { showToast } from './ui/toast'

const triggerStyle = css`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  height: 3.6rem;
  padding: 0 1.6rem;
  border: none;
  border-radius: 1.8rem;
  background: var(--bg-chip);
  color: var(--text-primary);
  font-size: 1.4rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: var(--bg-chip-hover);
  }
`

const panelStyle = css`
  min-width: 24rem;

  .emoji {
    margin-right: 0.8rem;
  }
`

const includes = (group: Group, channelId: string) => group.channels.some(kept => kept.id === channelId)

/** Puts `channel` in or out of each group, or in a new one. */
export const GroupsButton = ({ channel }: { channel: GroupChannel }) => {
  const groups = useGroups()
  const [creating, setCreating] = useState(false)
  const inAny = groups.some(group => includes(group, channel.id))
  const Icon = inAny ? FolderCheck : FolderPlus

  const onToggle = (group: Group) => {
    const included = !includes(group, channel.id)
    groupStore.setChannel(group.id, channel, included)
    showToast(included ? `Added to ${group.name}` : `Removed from ${group.name}`)
  }

  return (
    <>
      <Menu
        label='Groups'
        align='start'
        trigger={<button type='button' css={triggerStyle}><Icon size={18} strokeWidth={1.5} />Groups</button>}
      >
        <div css={panelStyle} role='presentation'>
          {groups.map(group => (
            <MenuItem
              key={group.id}
              label={<><span className='emoji' aria-hidden='true'>{group.emoji}</span>{group.name}</>}
              ariaLabel={group.name}
              checked={includes(group, channel.id)}
              onSelect={() => onToggle(group)}
            />
          ))}
          {groups.length > 0 ? <MenuSeparator /> : undefined}
          <MenuItem icon={Plus} label='New group' onSelect={() => setCreating(true)} />
        </div>
      </Menu>
      {creating
        ? (
          <GroupDialog
            channels={[channel]}
            onClose={() => setCreating(false)}
            onSaved={(group: Group) => showToast(`Added to ${group.name}`)}
          />
        )
        : undefined}
    </>
  )
}

export default GroupsButton

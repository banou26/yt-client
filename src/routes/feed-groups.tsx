import type { Group } from '../groups/store'

import { css } from '@emotion/react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'preact/hooks'
import { Link } from 'wouter'

import { useDocumentTitle } from '../app'
import { formatCount } from '../components/format'
import GroupDialog from '../components/group-dialog'
import Dialog from '../components/ui/dialog'
import { groupHrefFor, groupStore, useGroups } from '../groups/store'

const style = css`
  max-width: 96rem;
  padding: 2.4rem 1.6rem;

  /* not .head or .heading: the confirmation Dialog renders inside this page and uses both */
  .bar {
    display: flex;
    align-items: center;
    gap: 1.6rem;
    margin-bottom: 1.6rem;
  }

  .page-heading {
    flex: 1;
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    line-height: 2.8rem;
    color: var(--text-primary);
  }

  .new {
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
    transition: background 0.15s ease;
  }

  .new:hover {
    background: var(--bg-inverse-hover);
  }

  .empty {
    font-size: 1.4rem;
    color: var(--text-secondary);
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .group {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 1.6rem;
    min-height: 5.6rem;
    padding: 0 1.2rem;
    border-radius: 1rem;
    color: var(--text-primary);
    font-size: 1.6rem;
    transition: background 0.15s ease;
  }

  .group:hover {
    background: var(--bg-hover);
  }

  .emoji {
    flex: none;
    width: 3.2rem;
    font-size: 2.4rem;
    text-align: center;
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    flex: none;
    margin-left: auto;
    padding: 0.2rem 0.8rem;
    border-radius: 0.6rem;
    background: var(--bg-chip);
    color: var(--text-secondary);
    font-size: 1.2rem;
  }

  .icon {
    flex: none;
    width: 4rem;
    height: 4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .icon:hover {
    background: var(--bg-hover);
  }
`

const confirmStyle = css`
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;

  button {
    height: 3.6rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 1.8rem;
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
  }

  .cancel {
    background: transparent;
    color: var(--accent);
  }

  .cancel:hover {
    background: var(--accent-hover);
  }

  .delete {
    background: var(--bg-inverse);
    color: var(--text-inverse);
  }

  .delete:hover {
    background: var(--bg-inverse-hover);
  }
`

const FeedGroupsPage = () => {
  useDocumentTitle('Groups')
  const groups = useGroups()
  const [editing, setEditing] = useState<Group | 'new' | undefined>(undefined)
  const [deleting, setDeleting] = useState<Group | undefined>(undefined)

  const onDelete = () => {
    if (deleting) groupStore.deleteGroup(deleting.id)
    setDeleting(undefined)
  }

  return (
    <main css={style}>
      <div className='bar'>
        <h1 className='page-heading'>Groups</h1>
        <button type='button' className='new' onClick={() => setEditing('new')}>
          <Plus size={20} strokeWidth={1.5} />
          New group
        </button>
      </div>
      {groups.length === 0
        ? <p className='empty'>No groups yet</p>
        : (
          <ul className='list'>
            {groups.map(group => (
              <li key={group.id} className='row'>
                <Link href={groupHrefFor(group.id)} className='group'>
                  <span className='emoji' aria-hidden='true'>{group.emoji}</span>
                  <span className='name'>{group.name}</span>
                  <span className='count'>{formatCount(group.channels.length, 'channel')}</span>
                </Link>
                <button type='button' className='icon' aria-label={`Edit ${group.name}`} onClick={() => setEditing(group)}>
                  <Pencil size={20} strokeWidth={1.5} />
                </button>
                <button type='button' className='icon' aria-label={`Delete ${group.name}`} onClick={() => setDeleting(group)}>
                  <Trash2 size={20} strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
      {editing
        ? <GroupDialog group={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />
        : undefined}
      {deleting
        ? (
          <Dialog title={`Delete ${deleting.name}?`} onClose={() => setDeleting(undefined)}>
            <div css={confirmStyle}>
              <button type='button' className='cancel' onClick={() => setDeleting(undefined)}>Cancel</button>
              <button type='button' className='delete' onClick={onDelete}>Delete</button>
            </div>
          </Dialog>
        )
        : undefined}
    </main>
  )
}

export default FeedGroupsPage

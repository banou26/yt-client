import { css } from '@emotion/react'
import { Check, CircleUser, LogOut } from 'lucide-react'
import { useState } from 'preact/hooks'
import { Link } from 'wouter'

import type { SessionAccount } from '../session'

import { useDocumentTitle } from '../app'
import { atHandle, channelKey, useSession } from '../session'
import { signIn, signOut, switchChannel } from '../sign-in'

const style = css`
  max-width: 78rem;
  padding: 2.4rem 1.6rem;

  .heading {
    margin: 0 0 2.4rem;
    font-size: 2.4rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .current {
    display: flex;
    align-items: center;
    gap: 1.6rem;
    padding: 1.6rem;
    border: 1px solid var(--border);
    border-radius: 1.2rem;
  }

  .current .avatar,
  .current .initial {
    width: 6.4rem;
    height: 6.4rem;
    font-size: 2.8rem;
  }

  .avatar {
    border-radius: 50%;
    object-fit: cover;
    flex: none;
  }

  .initial {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--accent);
    color: var(--text-inverse);
    font-weight: 500;
    text-transform: uppercase;
  }

  .identity { min-width: 0; }

  .name {
    font-size: 1.8rem;
    color: var(--text-primary);
  }

  .handle {
    font-size: 1.4rem;
    color: var(--text-secondary);
  }

  .section {
    margin-top: 3.2rem;
  }

  .section-heading {
    margin: 0 0 1.2rem;
    font-size: 1.6rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 1rem 1.2rem;
    border: 1px solid var(--border);
    border-radius: 0.8rem;
    margin-bottom: 0.8rem;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 1.4rem;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .row:hover:not(:disabled) { background: var(--bg-hover); }
  .row:disabled { cursor: default; }
  .row.selected { cursor: default; }

  .row .avatar,
  .row .initial {
    width: 3.2rem;
    height: 3.2rem;
    font-size: 1.4rem;
  }

  .row .label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row .channel {
    display: flex;
    flex-direction: column;
  }

  .channel > span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .channel-handle {
    font-size: 1.2rem;
    color: var(--text-secondary);
  }

  .row .state {
    flex: none;
    font-size: 1.2rem;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .danger {
    color: var(--danger);
  }

  .error {
    margin-top: 0.8rem;
    font-size: 1.3rem;
    color: var(--danger);
  }

  .signed-out {
    color: var(--text-secondary);
    font-size: 1.4rem;
  }

  .sign-in {
    display: inline-block;
    margin-top: 1.2rem;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--accent);
  }
`

const Avatar = ({ name, avatar }: { name?: string, avatar?: string }) =>
  avatar
    ? <img className='avatar' src={avatar} alt='' referrerpolicy='no-referrer' />
    : <span className='initial' aria-hidden='true'>{name?.trim().charAt(0) || '?'}</span>

export const AccountPage = () => {
  useDocumentTitle('Account')
  const { ready, signedIn, name, avatar, handle, accounts } = useSession()
  const [switching, setSwitching] = useState<string>()
  const [signingOut, setSigningOut] = useState(false)
  const [failed, setFailed] = useState<string>()

  const busy = signingOut || switching !== undefined

  const onSwitch = (account: SessionAccount) => {
    if (busy) return
    setSwitching(channelKey(account))
    setFailed(undefined)
    switchChannel(account.brandPageId)
  }

  const onSignOut = async () => {
    if (busy) return
    setSigningOut(true)
    setFailed(undefined)
    try {
      await signOut()
    } catch {
      setSigningOut(false)
      setFailed('Could not clear the session. Try again.')
    }
  }

  if (ready && !signedIn) {
    return (
      <main css={style}>
        <h1 className='heading'>Account</h1>
        <p className='signed-out'>You are not signed in.</p>
        <button type='button' className='sign-in' onClick={signIn}>Sign in</button>
      </main>
    )
  }

  return (
    <main css={style}>
      <h1 className='heading'>Account</h1>
      <div className='current'>
        <Avatar name={name} avatar={avatar} />
        <div className='identity'>
          <div className='name'>{name ?? 'Signed in'}</div>
          {handle ? <div className='handle'>{atHandle(handle)}</div> : undefined}
        </div>
      </div>

      {handle
        ? (
          <div className='section'>
            <Link className='row' href={`/channel/${atHandle(handle)}`}>
              <CircleUser size={20} strokeWidth={1.5} />
              <span className='label'>Your channel</span>
            </Link>
          </div>
        )
        : undefined}

      {accounts.length > 1
        ? (
          <div className='section'>
            <h2 className='section-heading'>Accounts</h2>
            {accounts.map((account, index) => (
              <button
                key={channelKey(account)}
                type='button'
                className={`row ${account.selected ? 'selected' : ''}`}
                disabled={busy || account.selected}
                onClick={() => onSwitch(account)}
              >
                <Avatar name={account.name} avatar={account.avatar} />
                <span className='label channel'>
                  <span>{account.name ?? `Account ${index + 1}`}</span>
                  {account.handle ? <span className='channel-handle'>{atHandle(account.handle)}</span> : undefined}
                </span>
                <span className='state'>
                  {account.selected
                    ? <><Check size={16} strokeWidth={1.5} /> Current</>
                    : switching === channelKey(account) ? 'Switching…' : undefined}
                </span>
              </button>
            ))}
          </div>
        )
        : undefined}

      <div className='section'>
        <button type='button' className='row danger' disabled={busy} onClick={onSignOut}>
          <LogOut size={20} strokeWidth={1.5} />
          <span className='label'>{signingOut ? 'Signing out…' : 'Sign out'}</span>
        </button>
        {failed ? <p className='error'>{failed}</p> : undefined}
      </div>
    </main>
  )
}

export default AccountPage

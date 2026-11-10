import type { TargetedSubmitEvent } from 'preact'

import { css } from '@emotion/react'
import { Search } from 'lucide-react'
import { useRef } from 'preact/hooks'
import { useLocation } from 'wouter'

import { Logo } from '../components/header'

/* youtube.com's 404 page, measured at 1280 px on 2026-11-10: a 186 x 174 picture 10 px above two 500 px lines, then the
   logo and a square search box in a 440 px row 25 px below them, the whole block centred */
const style = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - var(--header-height));
  padding: 2.4rem 1.6rem;
  text-align: center;

  .illustration {
    flex: none;
    margin-bottom: 1rem;
  }

  .frame {
    fill: var(--bg-chip-hover);
  }

  .screen {
    fill: var(--bg-subtle);
  }

  .glyph {
    fill: var(--text-tertiary);
  }

  .lens {
    fill: var(--bg-base);
    fill-opacity: 0.6;
    stroke: var(--brand);
    stroke-width: 8;
  }

  .handle {
    stroke: var(--brand);
    stroke-width: 12;
    stroke-linecap: round;
  }

  p {
    width: 50rem;
    max-width: 100%;
    font-size: 1.6rem;
    line-height: 1.8rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 44rem;
    max-width: 100%;
    margin-top: 2.5rem;
  }

  form {
    flex: 1;
    display: flex;
    min-width: 0;
  }

  input {
    flex: 1;
    min-width: 0;
    height: 2.9rem;
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 1.6rem;
    outline: none;
  }

  input:focus {
    border-color: var(--accent-focus);
  }

  input::placeholder {
    color: var(--text-placeholder);
  }

  button {
    flex: none;
    width: 6.7rem;
    height: 2.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    background: var(--bg-input-button);
    color: var(--text-primary);
    cursor: pointer;
  }

  button:hover {
    background: var(--bg-chip-hover);
  }

  button svg {
    opacity: 0.6;
  }
`

export const NotFound = () => {
  const [, navigate] = useLocation()
  const inputRef = useRef<HTMLInputElement>(null)

  const onSubmit = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = inputRef.current?.value.trim()
    if (query) navigate(`/results?${new URLSearchParams({ search_query: query })}`)
  }

  return (
    <main css={style}>
      <svg className='illustration' width='186' height='174' viewBox='0 0 186 174' aria-hidden='true'>
        <rect className='frame' x='14' y='22' width='128' height='92' rx='12' />
        <rect className='screen' x='24' y='32' width='108' height='72' rx='6' />
        <path className='glyph' d='M68 54v28l22-14z' />
        <rect className='frame' x='62' y='114' width='32' height='10' />
        <rect className='frame' x='44' y='124' width='68' height='8' rx='4' />
        <line className='handle' x1='150' y1='128' x2='170' y2='148' />
        <circle className='lens' cx='128' cy='106' r='28' />
      </svg>
      <p>This page isn't available. Sorry about that.</p>
      <p>Try searching for something else.</p>
      <div className='row'>
        <Logo />
        <form onSubmit={onSubmit}>
          <input ref={inputRef} name='search_query' type='text' placeholder='Search' aria-label='Search' autoComplete='off' />
          <button type='submit' aria-label='Search'>
            <Search size={15} strokeWidth={2} />
          </button>
        </form>
      </div>
    </main>
  )
}

export default NotFound

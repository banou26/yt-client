import { css } from '@emotion/react'

import { signIn } from '../sign-in'

const style = css`
  min-height: calc(100vh - var(--header-height));
  display: flex;
  align-items: center;
  justify-content: center;

  .sign-in {
    height: 3.6rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 1.8rem;
    background: var(--bg-inverse);
    color: var(--text-inverse);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
  }
`

// the window opens on a click only, so a link straight to /signin lands on one button
const SignInPage = () => (
  <main css={style}>
    <button type='button' className='sign-in' onClick={signIn}>Sign in</button>
  </main>
)

export default SignInPage

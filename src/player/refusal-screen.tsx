import type { PlaybackRefusal } from '../frame/protocol'

import { css } from '@emotion/react'

import { signIn } from '../sign-in'

// youtube.com's two screens, measured in its 880 px player on 2026-11-10
const style = css`
  position: absolute;
  inset: 0;
  color: #ffffff;
  font-family: Roboto, Arial, sans-serif;

  &.notice {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    padding: 0 12%;
    background: radial-gradient(circle at 72% 50%, rgba(88, 20, 100, 0.55), transparent 42%), #0f0f0f;
  }

  .refusal-title {
    margin: 0;
    font-size: 2.4rem;
    font-weight: 700;
    line-height: 3.2rem;
  }

  .refusal-text {
    margin: 1.6rem 0 0;
    font-size: 1.4rem;
    line-height: 2rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .refusal-sign-in {
    margin-top: 1.6rem;
    height: 4rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 2rem;
    background: #ffffff;
    color: #000000;
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
  }

  .refusal-sign-in.large {
    height: 4.8rem;
    padding: 0 2rem;
    border-radius: 2.4rem;
    font-size: 1.8rem;
  }

  .refusal-sign-in:hover {
    background: #d9d9d9;
  }

  /* a members-only video: its thumbnail under a 75% black, the channel's avatar beside the text */
  &.offer {
    background: #000000;
  }

  .refusal-backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &.offer::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
  }

  .refusal-offer {
    position: absolute;
    z-index: 1;
    top: 5.6rem;
    left: 2.1rem;
    right: 2.1rem;
    display: flex;
    gap: 1rem;
    color: #eeeeee;
  }

  .refusal-avatar {
    flex: none;
    width: 10rem;
    height: 10rem;
    border-radius: 50%;
  }

  &.offer .refusal-title {
    font-size: 2rem;
    font-weight: 400;
    line-height: 2.4rem;
  }

  &.offer .refusal-text {
    margin: 0;
    color: inherit;
    line-height: 1.68rem;
  }

  @container player (max-width: 600px) {
    &.notice {
      padding: 0 2.4rem;
    }

    .refusal-title,
    &.offer .refusal-title {
      font-size: 1.6rem;
      line-height: 2.2rem;
    }

    .refusal-text {
      margin-top: 0.8rem;
      font-size: 1.2rem;
      line-height: 1.6rem;
    }

    .refusal-offer {
      top: 1.6rem;
      left: 1.6rem;
      right: 1.6rem;
    }

    .refusal-avatar {
      width: 4.8rem;
      height: 4.8rem;
    }
  }
`

/** What the player shows in place of a video upstream refused, laid out as youtube.com does. */
export const RefusalScreen = ({ refusal }: { refusal: PlaybackRefusal }) => {
  const description = refusal.description ? <p className='refusal-text'>{refusal.description}</p> : undefined
  if (refusal.avatar !== undefined || refusal.thumbnail !== undefined) {
    return (
      <div css={style} className='offer' data-refusal>
        {refusal.thumbnail ? <img className='refusal-backdrop' src={refusal.thumbnail} alt='' /> : undefined}
        <div className='refusal-offer'>
          {refusal.avatar ? <img className='refusal-avatar' src={refusal.avatar} alt='' /> : undefined}
          <div>
            <p className='refusal-title'>{refusal.title}</p>
            {description}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div css={style} className='notice' data-refusal>
      <p className='refusal-title'>{refusal.title}</p>
      {description}
      {refusal.signIn
        ? <button type='button' className={refusal.largeSignIn ? 'refusal-sign-in large' : 'refusal-sign-in'} onClick={signIn}>Sign in</button>
        : undefined}
    </div>
  )
}

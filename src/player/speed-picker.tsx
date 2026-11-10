import type { TargetedEvent } from 'preact'

import { css } from '@emotion/react'

import { MAX_RATE, MIN_RATE, RATE_CHIPS, RATE_STEP, toRate } from './rates'

/* youtube.com's Playback speed panel, measured 2026-11-10: the speed in 18 px black weight 24 px above a row of 32 px
   round - and + buttons 16 px either side of the slider, and 53 by 32 px chips 24 px below, 8 px apart, as wide as the
   chips it shows */
const style = css`
  width: 23.6rem;
  color: var(--text-primary);

  .speed {
    margin-bottom: 2.4rem;
    font-size: 1.8rem;
    font-weight: 900;
    line-height: 2.2rem;
    text-align: center;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 1.6rem;
    margin-bottom: 2.4rem;
  }

  .speed-button {
    flex: none;
    height: 3.2rem;
    padding: 0;
    border: none;
    border-radius: 1.6rem;
    background: var(--bg-hover);
    color: inherit;
    font: inherit;
    font-weight: 500;
    line-height: 1.6rem;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .speed-button:hover {
    background: var(--bg-hover-strong);
  }

  .step {
    width: 3.2rem;
    font-size: 2.4rem;
  }

  /* a 4 px track filled up to the speed and a 16 px knob, in Chrome through the --fill gradient and in Firefox through
     its progress part */
  input {
    flex: 1;
    min-width: 0;
    height: 2.4rem;
    margin: 0;
    background: transparent;
    appearance: none;
    cursor: pointer;
  }

  input::-webkit-slider-runnable-track {
    height: 0.4rem;
    border-radius: 1.2rem;
    background: linear-gradient(to right, var(--text-primary) var(--fill), #909090 var(--fill));
  }

  input::-webkit-slider-thumb {
    width: 1.6rem;
    height: 1.6rem;
    margin-top: -0.6rem;
    border-radius: 50%;
    background: var(--text-primary);
    appearance: none;
  }

  input::-moz-range-track {
    height: 0.4rem;
    border-radius: 1.2rem;
    background: #909090;
  }

  input::-moz-range-progress {
    height: 0.4rem;
    border-radius: 1.2rem;
    background: var(--text-primary);
  }

  input::-moz-range-thumb {
    width: 1.6rem;
    height: 1.6rem;
    border: none;
    border-radius: 50%;
    background: var(--text-primary);
  }

  .chips {
    display: flex;
    gap: 0.8rem;
  }

  .chip {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .chip .speed-button {
    width: 5.3rem;
    font-size: 1.2rem;
  }

  .chip-label {
    margin-top: 0.4rem;
    color: var(--text-secondary);
    font-size: 1rem;
    line-height: 1.4rem;
  }
`

// youtube.com's chips read 1.0 and 2.0 where its Settings row reads 1 and 2
const chipLabel = (rate: number) => (Number.isInteger(rate) ? rate.toFixed(1) : String(rate))

/** youtube.com's speed picker: the speed, a slider between - and + buttons that step by 0.05, and chips. */
export const SpeedPicker = ({ rate, onRate }: { rate: number, onRate: (rate: number) => void }) => (
  <div css={style}>
    <div className='speed' aria-live='polite'>{`${rate.toFixed(2)}x`}</div>
    <div className='slider-row'>
      <button
        type='button'
        className='speed-button step'
        aria-label='Decrease playback speed 0.05'
        onClick={() => onRate(toRate(rate - RATE_STEP))}
      >
        -
      </button>
      <input
        type='range'
        min={MIN_RATE}
        max={MAX_RATE}
        step={RATE_STEP}
        value={rate}
        aria-label='Playback speed'
        aria-valuetext={`${rate.toFixed(2)}x`}
        style={{ '--fill': `${((rate - MIN_RATE) / (MAX_RATE - MIN_RATE)) * 100}%` }}
        onInput={(event: TargetedEvent<HTMLInputElement>) => onRate(toRate(Number(event.currentTarget.value)))}
      />
      <button
        type='button'
        className='speed-button step'
        aria-label='Increase playback speed 0.05'
        onClick={() => onRate(toRate(rate + RATE_STEP))}
      >
        +
      </button>
    </div>
    <div className='chips'>
      {RATE_CHIPS.map(chip => (
        <div key={chip} className='chip'>
          <button type='button' className='speed-button' onClick={() => onRate(chip)}>{chipLabel(chip)}</button>
          {chip === 1 ? <span className='chip-label'>Normal</span> : undefined}
        </div>
      ))}
    </div>
  </div>
)

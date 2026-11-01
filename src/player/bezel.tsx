import { css } from '@emotion/react'
import { ChevronLeft, ChevronRight, Gauge, Pause, Play, Volume2, VolumeX } from 'lucide-react'

const ICONS = {
  play: Play,
  pause: Pause,
  volume: Volume2,
  mute: VolumeX,
  speed: Gauge,
}

/**
 * One feedback flash: `id` changes on every cue, so the same icon twice still
 * replays the animation. A `forward` or `back` cue is a seek, and its `text` is
 * the seconds it moved.
 */
export type BezelCue = { id: number, icon: keyof typeof ICONS | 'forward' | 'back', text?: string }

const style = css`
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: #ffffff;

  .bezel-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    display: grid;
    place-items: center;
    width: 5.2rem;
    height: 5.2rem;
    margin: -2.6rem 0 0 -2.6rem;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    animation: bezel-fade 0.5s linear forwards;
  }

  .bezel-text {
    position: absolute;
    top: 10%;
    left: 50%;
    padding: 1rem 2rem;
    border-radius: 0.4rem;
    background: rgba(0, 0, 0, 0.5);
    font-size: 1.8rem;
    font-weight: 500;
    transform: translateX(-50%);
    animation: bezel-text 1s ease-in forwards;
  }

  .bezel-seek {
    position: absolute;
    top: 50%;
    display: flex;
    align-items: center;
    gap: 1.2rem;
    font-size: 2.2rem;
    font-weight: 700;
    text-shadow: 0 0 0.4rem rgba(0, 0, 0, 0.5);
    transform: translateY(-50%);
    animation: bezel-text 1s ease-in forwards;
  }

  .bezel-seek.forward {
    right: 4.8rem;
  }

  .bezel-seek.back {
    left: 4.8rem;
  }

  @keyframes bezel-fade {
    from {
      opacity: 1;
      transform: scale(1);
    }

    to {
      opacity: 0;
      transform: scale(2);
    }
  }

  @keyframes bezel-text {
    0%,
    60% {
      opacity: 1;
    }

    100% {
      opacity: 0;
    }
  }
`

/**
 * youtube.com's feedback for a play, pause, volume or speed change, centered,
 * and for a seek, at the side it moved toward. Key it on `cue.id` to replay it.
 */
export const Bezel = ({ cue }: { cue: BezelCue }) => {
  if (cue.icon === 'forward' || cue.icon === 'back') {
    return (
      <div css={style} data-bezel={cue.icon} aria-hidden='true'>
        {cue.icon === 'forward'
          ? <div className='bezel-seek forward'><span>+ {cue.text}</span><ChevronRight size={28} strokeWidth={2.5} /></div>
          : <div className='bezel-seek back'><ChevronLeft size={28} strokeWidth={2.5} /><span>{'\u2212'} {cue.text}</span></div>}
      </div>
    )
  }
  const Icon = ICONS[cue.icon]
  return (
    <div css={style} data-bezel={cue.icon} aria-hidden='true'>
      {cue.text ? <div className='bezel-text'>{cue.text}</div> : undefined}
      <div className='bezel-icon'>
        <Icon size={26} fill={cue.icon === 'play' || cue.icon === 'pause' ? 'currentColor' : 'none'} strokeWidth={cue.icon === 'play' || cue.icon === 'pause' ? 0 : 2} />
      </div>
    </div>
  )
}

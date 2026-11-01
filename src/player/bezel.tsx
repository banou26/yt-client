import { css } from '@emotion/react'
import { FastForward, Gauge, Pause, Play, Rewind, Volume2, VolumeX } from 'lucide-react'

const ICONS = {
  play: Play,
  pause: Pause,
  forward: FastForward,
  back: Rewind,
  volume: Volume2,
  mute: VolumeX,
  speed: Gauge,
}

/** One feedback flash: `id` changes on every cue, so the same icon twice still replays the animation. */
export type BezelCue = { id: number, icon: keyof typeof ICONS, text?: string }

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

/** youtube.com's centered flash for a play, pause, seek, volume or speed change. Key it on `cue.id` to replay it. */
export const Bezel = ({ cue }: { cue: BezelCue }) => {
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

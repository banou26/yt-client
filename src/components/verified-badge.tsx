import { css } from '@emotion/react'

const style = css`
  display: inline-block;
  flex: none;
  margin-left: 0.4rem;
  vertical-align: -0.2em;
  fill: currentColor;
`

const CHECK = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1.9 14.7L6 12.6l1.4-1.4 2.7 2.7 6.5-6.5 1.4 1.4-7.9 7.9Z'
const NOTE = 'M12 4v9.38A3.95 3.95 0 0 0 10 13c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V8h4V4h-6Z'

export type BadgedChannel = {
  isVerified?: boolean | null
  isVerifiedArtist?: boolean | null
}

/**
 * The mark youtube.com prints after a channel name: a check for a verified
 * channel, a music note for an official artist channel. Renders nothing for a
 * channel with neither. It takes the colour of the name it follows.
 */
export const VerifiedBadge = ({ channel, size = 14 }: { channel?: BadgedChannel | null, size?: number }) => {
  if (!channel?.isVerified && !channel?.isVerifiedArtist) return null
  const label = channel.isVerifiedArtist ? 'Official Artist Channel' : 'Verified'
  return (
    <svg css={style} width={size} height={size} viewBox='0 0 24 24' role='img' aria-label={label} data-badge={channel.isVerifiedArtist ? 'artist' : 'verified'}>
      <title>{label}</title>
      <path d={channel.isVerifiedArtist ? NOTE : CHECK} />
    </svg>
  )
}

export default VerifiedBadge

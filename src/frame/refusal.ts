import type { PlaybackRefusal } from './protocol'

type RawText = string | { simpleText?: string, content?: string, runs?: { text?: string }[] }

type SignInButton = { signInEndpoint?: unknown }

type PlayabilityStatus = {
  status?: string
  reason?: string
  desktopLegacyAgeGateReason?: number
  errorScreen?: {
    playerLegacyDesktopYpcOfferRenderer?: { itemTitle?: string, itemThumbnail?: string, offerDescription?: string }
    playerInterstitialRenderer?: {
      content?: {
        interstitialViewModel?: {
          title?: RawText
          description?: RawText
          primaryButton?: { buttonViewModel?: { onTap?: { innertubeCommand?: SignInButton } } }
        }
      }
    }
    playerErrorMessageRenderer?: {
      reason?: RawText
      subreason?: RawText
      proceedButton?: { buttonRenderer?: { navigationEndpoint?: SignInButton } }
    }
  }
}

const textOf = (value: RawText | undefined) => {
  const text = typeof value === 'string'
    ? value
    : value?.simpleText ?? value?.content ?? value?.runs?.map((run) => run.text ?? '').join('')
  return text?.trim() || undefined
}

const widest = (thumbnails: { url?: string, width?: number }[] | undefined) =>
  [...thumbnails ?? []].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url

/**
 * The refusal in a watch page's player response whose playability is not OK, read from the screen youtube.com draws
 * over its player. The bot check also answers LOGIN_REQUIRED and a new identity can clear it, so of that status only
 * the age gate and a private video are final.
 */
export const readRefusal = (raw: Record<string, unknown>): PlaybackRefusal => {
  const playability = (raw.playabilityStatus ?? {}) as PlayabilityStatus
  const screen = playability.errorScreen
  const offer = screen?.playerLegacyDesktopYpcOfferRenderer
  const interstitial = screen?.playerInterstitialRenderer?.content?.interstitialViewModel
  const message = screen?.playerErrorMessageRenderer
  const reason = textOf(playability.reason)
  const status = playability.status
  const final = status === 'ERROR' || status === 'UNPLAYABLE'
    || (status === 'LOGIN_REQUIRED' && (playability.desktopLegacyAgeGateReason !== undefined || /private/i.test(reason ?? '')))
  const signIn = interstitial?.primaryButton?.buttonViewModel?.onTap?.innertubeCommand?.signInEndpoint !== undefined
    || message?.proceedButton?.buttonRenderer?.navigationEndpoint?.signInEndpoint !== undefined
  const details = raw.videoDetails as { thumbnail?: { thumbnails?: { url?: string, width?: number }[] } } | undefined
  return {
    title: textOf(offer?.itemTitle) ?? textOf(interstitial?.title) ?? textOf(message?.reason) ?? reason ?? 'Video unavailable',
    description: textOf(offer?.offerDescription) ?? textOf(interstitial?.description) ?? textOf(message?.subreason),
    thumbnail: offer ? widest(details?.thumbnail?.thumbnails) : undefined,
    avatar: textOf(offer?.itemThumbnail),
    signIn: signIn || undefined,
    final,
  }
}

import { describe, expect, it } from 'vite-plus/test'

import { PLAYBACK_REFUSED, playbackRefusal } from '../../../src/frame/protocol'
import { readRefusal } from '../../../src/frame/refusal'

// trimmed from the watch pages youtube.com answered on 2026-11-10, signed out
const MEMBERS_ONLY = {
  playabilityStatus: {
    status: 'UNPLAYABLE',
    reason: 'This video is available to this channel\'s members on level: LTT Members Plus (or any higher level). Join this channel to get access to members-only content and other exclusive perks.',
    errorScreen: {
      playerLegacyDesktopYpcOfferRenderer: {
        itemTitle: 'Members-only content',
        itemThumbnail: 'https://yt3.ggpht.com/avatar=s176-c-k-c0x00ffffff-no-rj',
        offerDescription: 'This video is available to this channel\'s members on level: LTT Members Plus (or any higher level). Join this channel to get access to members-only content and other exclusive perks.',
        offerId: 'sponsors_only_video',
      },
    },
  },
  videoDetails: {
    thumbnail: {
      thumbnails: [
        { url: 'https://i.ytimg.com/vi/CNbsMah32Ss/hqdefault.jpg', width: 336 },
        { url: 'https://i.ytimg.com/vi/CNbsMah32Ss/maxresdefault.jpg', width: 1920 },
      ],
    },
  },
}

const signInButton = { buttonViewModel: { title: 'Sign in', onTap: { innertubeCommand: { signInEndpoint: { nextEndpoint: { urlEndpoint: { url: '/watch?v=id' } } } } } } }

const AGE_GATE = {
  playabilityStatus: {
    status: 'LOGIN_REQUIRED',
    reason: 'Sign in to confirm your age',
    desktopLegacyAgeGateReason: 1,
    errorScreen: {
      playerInterstitialRenderer: {
        content: {
          interstitialViewModel: {
            title: { content: 'Sign in to confirm your age' },
            description: { content: 'This video may be inappropriate for some users.' },
            primaryButton: { buttonViewModel: { ...signInButton.buttonViewModel, buttonSize: 'BUTTON_VIEW_MODEL_SIZE_LARGE' } },
          },
        },
      },
    },
  },
}

const PRIVATE = {
  playabilityStatus: {
    status: 'LOGIN_REQUIRED',
    reason: 'Private video',
    messages: ['This is a private video. Please sign in to verify that you may see it.'],
    errorScreen: {
      playerInterstitialRenderer: {
        content: {
          interstitialViewModel: {
            title: { content: 'Private video' },
            description: { content: 'If the owner of this video has granted you access, please sign in.' },
            primaryButton: signInButton,
          },
        },
      },
    },
  },
}

const DELETED = {
  playabilityStatus: {
    status: 'ERROR',
    reason: 'This video is unavailable',
    errorScreen: {
      playerInterstitialRenderer: {
        content: { interstitialViewModel: { title: { content: 'Video unavailable' }, description: { content: 'This video is unavailable' } } },
      },
    },
  },
}

describe('a refused video', () => {
  it('reads a members-only video as youtube.com\'s panel over its widest thumbnail, final', () => {
    expect(readRefusal(MEMBERS_ONLY)).toEqual({
      title: 'Members-only content',
      description: MEMBERS_ONLY.playabilityStatus.errorScreen.playerLegacyDesktopYpcOfferRenderer.offerDescription,
      thumbnail: 'https://i.ytimg.com/vi/CNbsMah32Ss/maxresdefault.jpg',
      avatar: 'https://yt3.ggpht.com/avatar=s176-c-k-c0x00ffffff-no-rj',
      signIn: undefined,
      final: true,
    })
  })

  it('reads the age gate and a private video as final notices with Sign in, large only on the age gate', () => {
    expect(readRefusal(AGE_GATE)).toEqual({
      title: 'Sign in to confirm your age',
      description: 'This video may be inappropriate for some users.',
      thumbnail: undefined,
      avatar: undefined,
      signIn: true,
      largeSignIn: true,
      final: true,
    })
    const privateVideo = readRefusal(PRIVATE)
    expect(privateVideo).toMatchObject({
      title: 'Private video',
      description: 'If the owner of this video has granted you access, please sign in.',
      signIn: true,
      final: true,
    })
    expect(privateVideo.largeSignIn).toBeUndefined()
  })

  it('reads a deleted video as a final notice with no Sign in', () => {
    expect(readRefusal(DELETED)).toMatchObject({ title: 'Video unavailable', description: 'This video is unavailable', signIn: undefined, final: true })
  })

  it('keeps the bot check retryable, since a new identity can clear it', () => {
    const botCheck = {
      playabilityStatus: {
        status: 'LOGIN_REQUIRED',
        reason: 'Sign in to confirm you’re not a bot',
        errorScreen: {
          playerErrorMessageRenderer: {
            reason: { simpleText: 'Sign in to confirm you’re not a bot' },
            subreason: { runs: [{ text: 'This helps protect our community. ' }, { text: 'Learn more' }] },
            proceedButton: { buttonRenderer: { navigationEndpoint: { signInEndpoint: {} } } },
          },
        },
      },
    }
    expect(readRefusal(botCheck)).toMatchObject({
      title: 'Sign in to confirm you’re not a bot',
      description: 'This helps protect our community. Learn more',
      signIn: true,
      final: false,
    })
    expect(readRefusal({ playabilityStatus: { status: 'LIVE_STREAM_OFFLINE', reason: 'This live event will begin in 2 hours.' } }))
      .toMatchObject({ title: 'This live event will begin in 2 hours.', final: false })
  })

  it('falls back to upstream\'s reason for a screen it does not read', () => {
    expect(readRefusal({ playabilityStatus: { status: 'UNPLAYABLE', reason: 'This video requires payment to watch', errorScreen: { playerLegacyDesktopYpcTrailerRenderer: {} } } }))
      .toEqual({ title: 'This video requires payment to watch', description: undefined, thumbnail: undefined, avatar: undefined, signIn: undefined, final: true })
  })

  it('crosses the realms in the rejection\'s message and nowhere else', () => {
    const refusal = readRefusal(AGE_GATE)
    expect(playbackRefusal(new Error(`${PLAYBACK_REFUSED}${JSON.stringify(refusal)}`))).toEqual(JSON.parse(JSON.stringify(refusal)))
    expect(playbackRefusal(new Error('youtube: SABR URL is missing'))).toBeUndefined()
    expect(playbackRefusal(new Error(`${PLAYBACK_REFUSED}{`))).toBeUndefined()
    expect(playbackRefusal('Sign in to confirm your age')).toBeUndefined()
  })
})

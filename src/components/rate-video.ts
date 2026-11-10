import type { LikeStatus } from '../generated/graphql'

import { useMutation } from 'urql'

import { gql } from '../generated'
import { useSession } from '../session'
import { signIn } from '../sign-in'
import { lineFor } from './data-failure'
import { showToast } from './ui/toast'

const RATE_VIDEO = gql(`
  mutation RateVideo($id: ID!, $status: LikeStatus!) {
    rateVideo(id: $id, status: $status) {
      id
      likeStatus
    }
  }
`)

/**
 * Like and Dislike for one video, as the watch page and the full screen view both draw them. Signed out, `rate` opens
 * the sign-in window; otherwise it sets the rating, or clears it when the same one is pressed again. `rating` is true
 * while a change is on its way.
 */
export const useRateVideo = (videoId: string, likeStatus: LikeStatus | null | undefined) => {
  const [state, rateVideo] = useMutation(RATE_VIDEO)
  const { ready, signedIn } = useSession()

  const rate = (status: 'LIKE' | 'DISLIKE') => {
    // a signed-out read says INDIFFERENT like a signed-in one, so the status alone cannot tell them apart
    if (!likeStatus || (ready && !signedIn)) {
      signIn()
      return
    }
    const next = likeStatus === status ? 'INDIFFERENT' : status
    void rateVideo({ id: videoId, status: next }).then((result) => {
      if (result.error) showToast(lineFor(result.error))
    })
  }

  return { rate, rating: state.fetching }
}

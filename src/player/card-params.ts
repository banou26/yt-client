// history.state outlives a reload, and a reload reads the video as a shared link does
const DOCUMENT = crypto.randomUUID()

type CardState = { playerParams: string, document: string }

/**
 * The history state a card's watch link carries: the card's inline playback params, which the watch page reads the
 * video with, so YouTube schedules no ad before it and the first frame comes without a hold. The address stays the
 * plain /watch?v= one. Undefined for a card without params.
 */
export const cardState = (playerParams: string | undefined): CardState | undefined =>
  playerParams ? { playerParams, document: DOCUMENT } : undefined

/**
 * The card params a history entry was opened with in this document; undefined for a shared link, any other link, a
 * reload, or the next video.
 */
export const cardParamsIn = (state: unknown) => {
  const card = state as Partial<CardState> | null | undefined
  return card?.document === DOCUMENT && typeof card.playerParams === 'string' ? card.playerParams : undefined
}

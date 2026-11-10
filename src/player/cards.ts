let reveal: (() => void) | undefined

/**
 * Takes the player's requests to show the info cards, which the watch page's description answers by expanding and
 * scrolling to them. Returns the release, which leaves a newer registration alone.
 */
export const registerCards = (open: () => void) => {
  reveal = open
  return () => {
    if (reveal === open) reveal = undefined
  }
}

/** Shows the info cards under the watch page's description, as the player's "i" and its teasers do on youtube.com. */
export const revealCards = () => reveal?.()

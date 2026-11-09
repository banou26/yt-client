import { useEffect, useState } from 'preact/hooks'

import { getSettings, subscribeSettings } from './settings'

/** The dislike count in a Return YouTube Dislike `/votes` answer, or undefined when the answer has none to show. */
export const parseDislikes = (answer: unknown) => {
  if (!answer || typeof answer !== 'object') return undefined
  const { likes, dislikes } = answer as { likes?: unknown, dislikes?: unknown }
  if (typeof dislikes !== 'number' || !Number.isFinite(dislikes) || dislikes < 0) return undefined
  // an id it has never seen gets a 200 with every count at 0, not the 404 its docs promise (measured 2026-11-09)
  return dislikes === 0 && likes === 0 ? undefined : dislikes
}

/**
 * The video's dislike count from Return YouTube Dislike, fetched by the browser itself while the Show dislike counts
 * setting is on. Undefined while off, until the answer arrives, and for good when the lookup fails.
 */
export const useDislikes = (videoId: string) => {
  const [enabled, setEnabled] = useState(() => getSettings().showDislikes)
  const [answer, setAnswer] = useState<{ videoId: string, dislikes?: number }>()

  useEffect(() => subscribeSettings(settings => setEnabled(settings.showDislikes)), [])

  useEffect(() => {
    if (!enabled || videoId === '') return
    const controller = new AbortController()
    fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : undefined))
      .then(body => setAnswer({ videoId, dislikes: parseDislikes(body) }))
      .catch(() => {})
    return () => controller.abort()
  }, [videoId, enabled])

  return enabled && answer?.videoId === videoId ? answer.dislikes : undefined
}

import { useEffect, useState } from 'preact/hooks'

import { getSettings } from '../settings'

export type PlayerSession = {
  videoId?: string
  startAt?: number
  title?: string
  poster?: string
  // the playlist the video is playing from, with its 0-based position, so the end of the video can move along the queue
  list?: string
  index?: number
  theater: boolean
  claimed: boolean
  // the index of the chapter playing, which the player publishes for the watch page's list and cards
  chapter: number
  // the list open beside the player, or over it in full screen
  panel?: VideoPanel
}

export type VideoPanel = 'chapters' | 'transcript'

let session: PlayerSession = { theater: false, claimed: false, chapter: -1 }
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of [...listeners]) listener()
}

export const getPlayerSession = () => session

const update = (next: Partial<PlayerSession>) => {
  session = { ...session, ...next }
  emit()
}

/**
 * Show a video in the persistent player.
 *
 * Re-opening the video already playing never restarts it, and only takes its
 * title and its queue: the watch route calls this on every render pass that
 * has an id, and treating each one as a fresh open would restart playback
 * whenever the page re-rendered for an unrelated reason.
 */
export const openPlayer = (
  { videoId, startAt, title, poster, list, index }: {
    videoId: string
    startAt?: number
    title?: string
    poster?: string
    list?: string
    index?: number
  },
) => {
  if (session.videoId === videoId) {
    const retitled = title !== undefined && title !== session.title
    if (retitled || list !== session.list || index !== session.index) {
      update({ title: title ?? session.title, poster: poster ?? session.poster, list, index })
    }
    return
  }
  update({ videoId, startAt, title, poster, list, index, theater: getSettings().theater, chapter: -1, panel: undefined })
}

// the ONLY thing that closes the frame's SABR session: route unmount deliberately does not
/**
 * Stop playback entirely.
 *
 * This is the ONLY thing that closes the frame's SABR session now. Route
 * unmount deliberately does not, which is the whole point of the dock.
 */
export const closePlayer = () => {
  update({
    videoId: undefined, startAt: undefined, title: undefined, poster: undefined, list: undefined, index: undefined, theater: false,
    chapter: -1, panel: undefined,
  })
}

export const setTheater = (theater: boolean) => update({ theater })

export const setPlayingChapter = (chapter: number) => {
  if (chapter !== session.chapter) update({ chapter })
}

export const setPanel = (panel: VideoPanel | undefined) => {
  if (panel !== session.panel) update({ panel })
}

export const usePlayerSession = () => {
  const [value, setValue] = useState(session)
  useEffect(() => {
    const listener = () => setValue(session)
    listeners.add(listener)
    // the store can have moved between the initial read and this effect
    listener()
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return value
}

// MOVED with appendChild, never createPortal: a container change remounts a FRESH <video> and loses the MediaSource
let host: HTMLDivElement | undefined
let dock: HTMLElement | undefined

const ensureHost = () => {
  host ??= Object.assign(document.createElement('div'), { className: 'player-host' })
  return host
}

export const registerPlayerDock = (element: HTMLElement | null) => {
  dock = element ?? undefined
  if (dock && host && host.parentElement === null) dock.append(host)
}

/**
 * Move the player into `slot`, or back to the dock when it is null.
 *
 * Called from a ref callback, so it runs with the element on mount and with
 * null on unmount, which is exactly the claim/release pair the dock needs.
 */
export const claimPlayer = (slot: HTMLElement | null) => {
  const element = ensureHost()
  const target = slot ?? dock
  if (target && element.parentElement !== target) target.append(element)
  if (session.claimed !== Boolean(slot)) update({ claimed: Boolean(slot) })
}

export const playerHost = ensureHost

import type { Point } from '../components/ui/popup'

import { Code, Link, PictureInPicture, Repeat } from 'lucide-react'

import { ContextMenu, MenuItem } from '../components/ui/menu'
import { showToast } from '../components/ui/toast'
import { embedCode, watchLink } from './links'

/**
 * The player's right-click menu: youtube.com's rows in its order (measured 2026-11-10), less its debug rows and Stats
 * for nerds. Leave `onMiniplayer` out where youtube.com leaves that row out, in the miniplayer and in fullscreen.
 * `onCopied` follows a copy that landed, which youtube.com marks with a bezel of the row's icon.
 */
export const PlayerMenu = (
  { at, onClose, video, videoId, list, title, loop, onLoop, onMiniplayer, onCopied }: {
    at: () => Point
    onClose: () => void
    video: HTMLVideoElement
    videoId: string
    list?: string
    title?: string
    loop: boolean
    onLoop: () => void
    onMiniplayer?: () => void
    onCopied: (icon: 'link' | 'code') => void
  },
) => {
  const copy = async (text: string, icon: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text)
      onCopied(icon)
    } catch {
      showToast('Could not copy')
    }
  }
  const link = (t?: number) => watchLink(location.origin, videoId, { list, t })
  const copyEmbed = () => {
    const { width, height } = video.closest('[data-player-root]')!.getBoundingClientRect()
    void copy(embedCode({ videoId, title, width, height }), 'code')
  }

  return (
    <ContextMenu at={at} label='Player menu' media onClose={onClose}>
      <MenuItem icon={Repeat} label='Loop' checked={loop} closeOnSelect onSelect={onLoop} />
      {onMiniplayer ? <MenuItem icon={PictureInPicture} label='Miniplayer' onSelect={onMiniplayer} /> : undefined}
      <MenuItem icon={Link} label='Copy video URL' onSelect={() => void copy(link(), 'link')} />
      <MenuItem icon={Link} label='Copy video URL at current time' onSelect={() => void copy(link(video.currentTime), 'link')} />
      <MenuItem icon={Code} label='Copy embed code' onSelect={copyEmbed} />
    </ContextMenu>
  )
}

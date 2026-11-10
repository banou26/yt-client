import type { EndScreenElement } from '../frame/protocol'

/** The part of the player the picture fills at whole pixels from its corner, since the video draws with `object-fit: contain`. */
export type Picture = { x: number, y: number, width: number, height: number }

export const pictureOf = (video: HTMLVideoElement): Picture => {
  const width = video.clientWidth
  const height = video.clientHeight
  const scale = video.videoWidth > 0 && video.videoHeight > 0
    ? Math.min(width / video.videoWidth, height / video.videoHeight)
    : 0
  const pictureWidth = Math.round(scale > 0 ? video.videoWidth * scale : width)
  const pictureHeight = Math.round(scale > 0 ? video.videoHeight * scale : height)
  return { x: Math.round((width - pictureWidth) / 2), y: Math.round((height - pictureHeight) / 2), width: pictureWidth, height: pictureHeight }
}

/**
 * Where youtube.com's player puts an element in the picture, at whole pixels (measured 2026-11-10 at five player
 * sizes, and the height at 251 picture widths from 634 to 1183 px): the height follows from the unrounded width, the
 * corners round 12 px from a 256 px wide tile and 8 px from 98 px, and the hover card opens away from the nearer side.
 */
export const placeElement = (element: EndScreenElement, picture: Pick<Picture, 'width' | 'height'>) => {
  const width = Math.round(element.width * picture.width)
  return {
    left: Math.round(element.left * picture.width),
    top: Math.round(element.top * picture.height),
    width,
    height: Math.round(element.width * picture.width / element.aspectRatio),
    radius: width >= 256 ? 12 : width >= 98 ? 8 : 4,
    opensLeft: element.left + element.width / 2 > 0.5,
  }
}

/**
 * Whether an element is on screen `ms` into the video, or within `lead` ms of it: from its start until its end, and
 * never once the video has ended, whatever its end says.
 */
export const showsAt = (element: EndScreenElement, ms: number, ended: boolean, lead = 0) =>
  !ended && ms >= element.startMs - lead && ms < element.endMs

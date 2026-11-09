export type PlayerChapter = {
  title: string
  startSeconds: number
  thumbnail?: string | null
}

/**
 * The index of the chapter `time` falls in, or -1 without chapters or before the first. Also youtube.com's rule for
 * the transcript line it highlights: the last one started, even past its own end or in a list of search results.
 */
export const chapterIndexAt = (chapters: readonly { startSeconds: number }[], time: number) =>
  chapters.findLastIndex(chapter => chapter.startSeconds <= time)

/**
 * Where Ctrl+Right (1) and Ctrl+Left (-1) seek to, as youtube.com does: the start of the chapter after the one
 * playing, or of the one before it, so Ctrl+Left never returns to the start of the current chapter. Undefined at
 * either end, where youtube.com does nothing.
 */
export const chapterStep = (chapters: readonly PlayerChapter[], time: number, direction: 1 | -1) =>
  chapters[chapterIndexAt(chapters, time) + direction]?.startSeconds

export type BarPart = { start: number, end: number }

/** The seek bar's parts: one per chapter, or one for the whole video. */
export const barParts = (chapters: readonly PlayerChapter[], duration: number): BarPart[] => {
  const bounds = [0, ...chapters.map(chapter => chapter.startSeconds).filter(start => start > 0 && start < duration), duration]
  return bounds.slice(0, -1).map((start, index) => ({ start, end: bounds[index + 1]! }))
}

// youtube.com's gap between two chapters, at every player size (measured 2026-11-10 at 400, 412, 880 and 1280 px)
const GAP_REM = 0.4

/**
 * Where `time` sits along a bar of `parts`, as a CSS length: each part takes its share of the bar less the gaps,
 * and the gaps before it push it along.
 */
export const barOffset = (parts: readonly BarPart[], duration: number, time: number) => {
  const share = duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0
  const before = Math.max(0, parts.findLastIndex(part => part.start <= time))
  return `calc(${share * 100}% + ${(before - share * (parts.length - 1)) * GAP_REM}rem)`
}

/** A part's own width, as a CSS length, and the whole bar until the duration is known. */
export const barWidth = (parts: readonly BarPart[], duration: number, part: BarPart) => {
  if (duration <= 0) return '100%'
  const share = (part.end - part.start) / duration
  return `calc(${share * 100}% - ${share * (parts.length - 1) * GAP_REM}rem)`
}

/** How much of a part `time` has passed, as a share of the part's own width. */
export const barFill = (part: BarPart, time: number) =>
  `${part.end > part.start ? Math.max(0, Math.min(1, (time - part.start) / (part.end - part.start))) * 100 : 0}%`

/**
 * The time under `x`, given the parts' boxes in the same order as `parts`. A point in a gap belongs to the part after
 * it, as on youtube.com.
 */
export const timeAtOffset = (parts: readonly BarPart[], boxes: readonly { left: number, width: number }[], x: number) => {
  const index = Math.max(0, boxes.findLastIndex(box => box.left <= x))
  const part = parts[index]
  const box = boxes[index]
  if (!part || !box) return 0
  const ratio = box.width > 0 ? Math.max(0, Math.min(1, (x - box.left) / box.width)) : 0
  return part.start + ratio * (part.end - part.start)
}

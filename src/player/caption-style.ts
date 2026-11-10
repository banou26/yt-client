import type { Settings } from '../settings'

/** youtube.com's caption sizes, in percent of the default (measured 2026-11-10): + and - step two at a time. */
export const CAPTION_SIZES = [50, 75, 100, 125, 150, 175, 200]

// youtube.com labels each size by its step rather than by what it draws: its 150% draws 125% (measured 2026-11-10)
const SIZE_LABELS = ['50%', '75%', '100%', '150%', '200%', '300%', '400%']

// youtube.com's own stacks (measured 2026-11-10); its Small Capitals also sets small-caps, which Chrome does not draw on a cue
const FONTS: Record<string, string> = {
  'Monospaced Serif': '"Courier New", Courier, "Nimbus Mono L", "Cutive Mono", serif-monospace, monospace',
  'Proportional Serif': '"Times New Roman", Times, Georgia, Cambria, "PT Serif Caption", serif',
  'Monospaced Sans-Serif': '"Deja Vu Sans Mono", "Lucida Console", Monaco, Consolas, "PT Mono", sans-serif-monospace, monospace',
  'Proportional Sans-Serif': '"YouTube Noto", Roboto, Arial, Helvetica, Verdana, "PT Sans Caption", sans-serif',
  Casual: '"Comic Sans MS", Impact, Handlee, fantasy',
  Cursive: '"Monotype Corsiva", "URW Chancery L", "Apple Chancery", "Dancing Script", cursive',
  'Small Capitals': 'Arial, Helvetica, Verdana, "Marcellus SC", sans-serif',
}

const COLORS: Record<string, string> = {
  White: '255, 255, 255',
  Yellow: '255, 255, 0',
  Green: '0, 255, 0',
  Cyan: '0, 255, 255',
  Blue: '0, 0, 255',
  Magenta: '255, 0, 255',
  Red: '255, 0, 0',
  Black: '8, 8, 8',
}

const EDGES = ['None', 'Drop Shadow', 'Raised', 'Depressed', 'Outline']

// `for (; from <= to; from += step)` as youtube.com writes it, so the float steps give the same count
const steps = (from: number, to: number, step: number) => {
  const values: number[] = []
  for (let value = from; value <= to; value += step) values.push(value)
  return values
}

/* youtube.com's edges as its captions module draws them (read 2026-11-10): lengths in 32nds of the player's base
   caption size, never of the chosen size, and at least 1 px; Raised draws a shadow every pixel, or half pixel on a 2x
   screen */
const edgeShadows = (edge: string, base: number, dark: string, light: string) => {
  const unit = Math.max(base, 1) / 32
  const [m, n, p, q] = [1, 2, 3, 5].map(times => Math.max(times * unit, 1)) as [number, number, number, number]
  switch (edge) {
    case 'Drop Shadow': return steps(p, q, unit).map(blur => `${dark} ${n}px ${n}px ${blur}px`)
    case 'Raised': return steps(m, p, globalThis.devicePixelRatio >= 2 ? 0.5 : 1).map(offset => `${dark} ${offset}px ${offset}px`)
    case 'Depressed': return [`${light} ${m}px ${m}px`, `${dark} -${m}px -${m}px`]
    case 'Outline': return Array.from({ length: 5 }, () => `${dark} 0 0 ${n}px`)
    default: return []
  }
}

/** The caption look the Subtitles Options panel sets, one setting to a row. */
export type CaptionLook = Pick<Settings, 'captionFont' | 'captionColor' | 'captionSize' | 'captionBackground' | 'captionBackgroundOpacity' | 'captionEdge' | 'captionOpacity'>

/** A row of youtube.com's Subtitles/CC Options panel, in its order and with its choices in theirs (measured 2026-11-10). */
export type CaptionOption = { key: keyof CaptionLook, label: string, choices: { value: string | number, label: string }[] }

const named = (labels: string[]) => labels.map(label => ({ value: label, label }))
const percents = (values: number[]) => values.map(value => ({ value, label: `${value * 100}%` }))

export const CAPTION_OPTIONS: CaptionOption[] = [
  { key: 'captionFont', label: 'Font family', choices: named(Object.keys(FONTS)) },
  { key: 'captionColor', label: 'Font color', choices: named(Object.keys(COLORS)) },
  { key: 'captionSize', label: 'Font size', choices: CAPTION_SIZES.map((value, index) => ({ value, label: SIZE_LABELS[index]! })) },
  { key: 'captionBackground', label: 'Background color', choices: named(Object.keys(COLORS)) },
  { key: 'captionBackgroundOpacity', label: 'Background opacity', choices: percents([0, 0.25, 0.5, 0.75, 1]) },
  { key: 'captionEdge', label: 'Character edge style', choices: named(EDGES) },
  { key: 'captionOpacity', label: 'Font opacity', choices: percents([0.25, 0.5, 0.75, 1]) },
]

/** The size + or - moves to from `size`: two of the sizes on, held at either end. */
export const stepCaptionSize = (size: number, direction: 1 | -1) =>
  Math.min(CAPTION_SIZES.at(-1)!, Math.max(CAPTION_SIZES[0]!, size + direction * 50))

/**
 * The look as declarations for a drawn cue, and for the sample drawn in place of one, on a player whose base caption
 * size is `base` px. The font opacity carries to the edge.
 */
export const captionDeclarations = (look: CaptionLook, base: number) => {
  const alpha = look.captionOpacity
  const shadows = edgeShadows(look.captionEdge, base, `rgba(34, 34, 34, ${alpha})`, `rgba(204, 204, 204, ${alpha})`)
  return [
    `font-size: ${look.captionSize}%`,
    `font-family: ${FONTS[look.captionFont]}`,
    `color: rgba(${COLORS[look.captionColor]}, ${alpha})`,
    `background-color: rgba(${COLORS[look.captionBackground]}, ${look.captionBackgroundOpacity})`,
    `text-shadow: ${shadows.length > 0 ? shadows.join(', ') : 'none'}`,
  ].join('; ')
}

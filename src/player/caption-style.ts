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

// youtube.com's shadows, which grow with the caption (measured 2026-11-10 on 16.5 and 33.6 px captions)
const EDGES: Record<string, (dark: string, light: string) => string> = {
  'None': () => 'none',
  'Drop Shadow': dark => [0.09375, 0.125, 0.15625].map(blur => `${dark} 0.0625em 0.0625em ${blur}em`).join(', '),
  'Raised': dark => [0.03, 0.06, 0.09].map(offset => `${dark} ${offset}em ${offset}em`).join(', '),
  'Depressed': (dark, light) => `${light} 0.06em 0.06em, ${dark} -0.06em -0.06em`,
  'Outline': dark => Array.from({ length: 5 }, () => `${dark} 0 0 0.0625em`).join(', '),
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
  { key: 'captionEdge', label: 'Character edge style', choices: named(Object.keys(EDGES)) },
  { key: 'captionOpacity', label: 'Font opacity', choices: percents([0.25, 0.5, 0.75, 1]) },
]

/** The size + or - moves to from `size`: two of the sizes on, held at either end. */
export const stepCaptionSize = (size: number, direction: 1 | -1) =>
  Math.min(CAPTION_SIZES.at(-1)!, Math.max(CAPTION_SIZES[0]!, size + direction * 50))

/** The look as declarations for a drawn cue, and for the sample drawn in place of one. The font opacity carries to the edge. */
export const captionDeclarations = (look: CaptionLook) => {
  const alpha = look.captionOpacity
  return [
    `font-size: ${look.captionSize}%`,
    `font-family: ${FONTS[look.captionFont]}`,
    `color: rgba(${COLORS[look.captionColor]}, ${alpha})`,
    `background-color: rgba(${COLORS[look.captionBackground]}, ${look.captionBackgroundOpacity})`,
    `text-shadow: ${EDGES[look.captionEdge]!(`rgba(34, 34, 34, ${alpha})`, `rgba(204, 204, 204, ${alpha})`)}`,
  ].join('; ')
}

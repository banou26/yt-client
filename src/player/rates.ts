/** youtube.com's speed slider signed out: 0.25 to 2 in steps of 0.05 (measured 2026-11-10). */
export const MIN_RATE = 0.25
export const MAX_RATE = 2
export const RATE_STEP = 0.05

/** The chips under the slider. youtube.com's 1.75 is hidden at its panel's width, and its 3.0 is for Premium. */
export const RATE_CHIPS = [1, 1.25, 1.5, 2]

/** `rate` held to the slider's range and its steps of a twentieth, so a sum such as 1.1 + 0.05 is stored as 1.15. */
export const toRate = (rate: number) => Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(rate * 20) / 20))

/** The < and > keys: 0.25 faster (`step` 1) or slower (-1) than `rate`, held at the ends, so 1.1 goes to 1.35. */
export const stepRate = (rate: number, step: 1 | -1) => toRate(rate + step * 0.25)

/** A speed as the Settings menu row reads it on youtube.com: Normal, else the bare number, such as 1.1. */
export const rateDetail = (rate: number) => (rate === 1 ? 'Normal' : String(rate))

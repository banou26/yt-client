/** The speeds the settings menu offers, which the < and > keys step through. */
export const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

/** The next speed up (`step` 1) or down (-1) from `rate`, held at the ends of RATES. */
export const stepRate = (rate: number, step: 1 | -1) => {
  if (step > 0) return RATES.find(value => value > rate + 1e-6) ?? RATES[RATES.length - 1]!
  return RATES.findLast(value => value < rate - 1e-6) ?? RATES[0]!
}

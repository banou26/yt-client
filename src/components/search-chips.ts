/**
 * youtube.com's search chip row, each chip expressed as one of the app's own
 * search filters. Its Unwatched chip is left out: no filter says it.
 *
 * Recently uploaded is upload date "This week": upstream's own chip is an
 * opaque ranking token that no filter can encode, and a week is the nearest
 * thing a filter can say.
 */
export type SearchChip = {
  id: 'all' | 'shorts' | 'videos' | 'recent' | 'live'
  label: string
  param?: 'type' | 'upload_date' | 'features'
  value?: string
}

export const SEARCH_CHIPS: SearchChip[] = [
  { id: 'all', label: 'All' },
  { id: 'shorts', label: 'Shorts', param: 'type', value: 'SHORTS' },
  { id: 'videos', label: 'Videos', param: 'type', value: 'VIDEO' },
  { id: 'recent', label: 'Recently uploaded', param: 'upload_date', value: 'WEEK' },
  { id: 'live', label: 'Live', param: 'features', value: 'LIVE' },
]

const CHIP_PARAMS = ['type', 'upload_date', 'features'] as const

/** The chip the current filters amount to: All when no chip filter is set, none when they match no single chip. */
export const activeChip = (params: URLSearchParams): SearchChip['id'] | undefined => {
  const set = CHIP_PARAMS.filter(param => params.get(param))
  if (set.length === 0) return 'all'
  if (set.length > 1) return undefined
  return SEARCH_CHIPS.find(chip => chip.param !== undefined && chip.param === set[0] && params.get(chip.param) === chip.value)?.id
}

/** The query string a chip leads to: the chips are exclusive, so the other chip filters go and duration and sort stay. */
export const chipSearch = (params: URLSearchParams, chip: SearchChip) => {
  const next = new URLSearchParams(params)
  for (const param of CHIP_PARAMS) next.delete(param)
  if (chip.param && chip.value) next.set(chip.param, chip.value)
  return next.toString()
}

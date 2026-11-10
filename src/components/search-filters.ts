import type { SearchDuration, SearchFeature, SearchFilters, SearchSort, SearchType, SearchUploadDate } from '../generated/graphql'

import { base64Bytes, protoField } from '../sources/youtube/protobuf'

export type FilterOption<Value extends string = string> = {
  value: Value
  label: string
  /** The option in youtube.com's `sp=`: the value at its group's field, or for a feature the number of its own field under the group's, which holds 1. */
  code: number
}

/** A group of youtube.com's Filters panel, held in one readable query parameter (features as a comma list). */
export type FilterGroup<Value extends string = string> = {
  param: 'type' | 'duration' | 'upload_date' | 'features' | 'sort'
  label: string
  /** The path to the group's field in youtube.com's `sp=` message. */
  field: number[]
  options: FilterOption<Value>[]
}

const TYPE: FilterGroup<SearchType> = {
  param: 'type',
  label: 'Type',
  field: [2, 2],
  options: [
    { value: 'VIDEO', label: 'Videos', code: 1 },
    { value: 'SHORTS', label: 'Shorts', code: 9 },
    { value: 'CHANNEL', label: 'Channels', code: 2 },
    { value: 'PLAYLIST', label: 'Playlists', code: 3 },
    { value: 'MOVIE', label: 'Movies', code: 4 },
  ],
}

const DURATION: FilterGroup<SearchDuration> = {
  param: 'duration',
  label: 'Duration',
  field: [2, 3],
  options: [
    { value: 'UNDER_THREE_MINS', label: 'Under 3 minutes', code: 4 },
    { value: 'THREE_TO_TWENTY_MINS', label: '3 - 20 minutes', code: 5 },
    { value: 'OVER_TWENTY_MINS', label: 'Over 20 minutes', code: 2 },
  ],
}

const UPLOAD_DATE: FilterGroup<SearchUploadDate> = {
  param: 'upload_date',
  label: 'Upload date',
  field: [2, 1],
  options: [
    { value: 'TODAY', label: 'Today', code: 2 },
    { value: 'WEEK', label: 'This week', code: 3 },
    { value: 'MONTH', label: 'This month', code: 4 },
    { value: 'YEAR', label: 'This year', code: 5 },
  ],
}

const FEATURES: FilterGroup<SearchFeature> = {
  param: 'features',
  label: 'Features',
  field: [2],
  options: [
    { value: 'LIVE', label: 'Live', code: 8 },
    { value: 'FOUR_K', label: '4K', code: 14 },
    { value: 'HD', label: 'HD', code: 4 },
    { value: 'SUBTITLES', label: 'Subtitles/CC', code: 5 },
    { value: 'CREATIVE_COMMONS', label: 'Creative Commons', code: 6 },
    { value: 'THREE_SIXTY', label: '360°', code: 15 },
    { value: 'VR180', label: 'VR180', code: 26 },
    { value: 'THREE_D', label: '3D', code: 7 },
    { value: 'HDR', label: 'HDR', code: 25 },
    { value: 'LOCATION', label: 'Location', code: 23 },
    { value: 'PURCHASED', label: 'Purchased', code: 9 },
  ],
}

const PRIORITIZE: FilterGroup<SearchSort> = {
  param: 'sort',
  label: 'Prioritize',
  field: [1],
  options: [
    { value: 'RELEVANCE', label: 'Relevance', code: 0 },
    { value: 'POPULARITY', label: 'Popularity', code: 3 },
  ],
}

/** youtube.com's Filters panel signed out, in its order, as measured on 2026-11-10. */
export const FILTER_GROUPS: FilterGroup[] = [TYPE, DURATION, UPLOAD_DATE, FEATURES, PRIORITIZE]

const kept = (group: FilterGroup, value: string | null) => {
  const values = group.param === 'features' ? [...new Set(value?.split(','))] : [value]
  const known = values.filter(entry => group.options.some(option => option.value === entry))
  return known.length > 0 ? known.join(',') : undefined
}

// an older ordering (upload date, rating) and any field the panel has no option for are left out
const fromSp = (sp: string) => {
  const params = new URLSearchParams()
  let bytes: Uint8Array
  try {
    bytes = base64Bytes(sp)
  } catch {
    return params
  }
  for (const group of FILTER_GROUPS) {
    const options = group.param === 'features'
      ? group.options.filter(option => protoField(bytes, [...group.field, option.code]) === 1)
      : group.options.filter(option => protoField(bytes, group.field) === option.code)
    if (options.length > 0) params.set(group.param, options.map(option => option.value).join(','))
  }
  return params
}

/**
 * The search page's query parameters: a youtube.com `sp=` read into the readable ones it would set, and every filter
 * value no option has dropped, so a link from anywhere asks only what the panel can show. A readable value that is
 * kept wins over the `sp=` one.
 */
export const searchParams = (search: string) => {
  const params = new URLSearchParams(search)
  const sp = fromSp(params.get('sp') ?? '')
  params.delete('sp')
  for (const group of FILTER_GROUPS) {
    const value = kept(group, params.get(group.param)) ?? kept(group, sp.get(group.param))
    if (value === undefined) params.delete(group.param)
    else params.set(group.param, value)
  }
  return params
}

/** The values a group holds in `searchParams`'s answer: Prioritize holds Relevance when nothing is set. */
export const chosen = (params: URLSearchParams, group: FilterGroup) =>
  params.get(group.param)?.split(',') ?? (group === PRIORITIZE ? ['RELEVANCE'] : [])

/** Whether picking a chosen option takes it off, which is every group's but Prioritize's. */
export const removable = (group: FilterGroup) => group !== PRIORITIZE

/** The query string picking an option leads to: it replaces its group's value, or a feature joins the others; a chosen one goes. */
export const filterSearch = (params: URLSearchParams, group: FilterGroup, value: string) => {
  const next = new URLSearchParams(params)
  const values = chosen(params, group)
  const picked = values.includes(value)
    ? values.filter(entry => entry !== value)
    : group.param === 'features' ? [...values, value] : [value]
  if (picked.length === 0 || (group === PRIORITIZE && picked[0] === 'RELEVANCE')) next.delete(group.param)
  else next.set(group.param, picked.join(','))
  return next.toString()
}

/** The search's filters for the API, from `searchParams`'s answer. */
export const searchFilters = (params: URLSearchParams): SearchFilters => {
  const features = params.get('features')?.split(',') as SearchFeature[] | undefined
  return {
    uploadDate: (params.get('upload_date') ?? undefined) as SearchUploadDate | undefined,
    type: (params.get('type') ?? undefined) as SearchType | undefined,
    duration: (params.get('duration') ?? undefined) as SearchDuration | undefined,
    sortBy: (params.get('sort') ?? undefined) as SearchSort | undefined,
    features,
    unwatched: params.get('unwatched') ? true : undefined,
  }
}

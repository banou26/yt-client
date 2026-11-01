const compactNumber = new Intl.NumberFormat('en', { notation: 'compact' })

// wouter already decodeURI-s the pathname, so params can hold a literal '%' that makes decodeURIComponent throw
export const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const formatViews = (viewCount?: string | null) => {
  if (!viewCount) return undefined
  if (!/^\d+$/.test(viewCount)) return viewCount
  return `${compactNumber.format(Number(viewCount))} views`
}

export const formatDuration = (seconds?: number | null) => {
  if (seconds === undefined || seconds === null || seconds <= 0) return undefined
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return (
    hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
      : `${minutes}:${String(rest).padStart(2, '0')}`
  )
}

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'always' })

const AGO_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400],
  ['month', 30 * 86_400],
  ['week', 7 * 86_400],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

/** An ISO time as upstream words it on a card ('3 days ago'), or undefined when it is not a time. */
export const formatAgo = (iso?: string | null, now = Date.now()) => {
  const at = iso ? Date.parse(iso) : Number.NaN
  if (Number.isNaN(at)) return undefined
  const seconds = Math.max(0, (now - at) / 1000)
  const [unit, size] = AGO_UNITS.find(([, length]) => seconds >= length) ?? ['second', 1]
  return relativeTime.format(-Math.floor(seconds / size), unit)
}

export const formatCount = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

export const formatMeta = (viewCount?: string | null, publishedText?: string | null) => {
  const parts = [formatViews(viewCount), publishedText ?? undefined].filter(part => part !== undefined)
  return parts.length > 0 ? parts.join(' • ') : undefined
}

/**
 * The description box's first line, as youtube.com writes it: the rounded
 * count and the relative date while collapsed, the exact ones once expanded.
 * Each falls back to the other form when upstream sent only one.
 */
export const descriptionMeta = (
  { expanded, viewCountText, shortViewCountText, publishedDateText, relativeDateText }: {
    expanded: boolean
    viewCountText?: string | null
    shortViewCountText?: string | null
    publishedDateText?: string | null
    relativeDateText?: string | null
  },
) => {
  const parts = expanded
    ? [viewCountText ?? shortViewCountText, publishedDateText ?? relativeDateText]
    : [shortViewCountText ?? viewCountText, relativeDateText ?? publishedDateText]
  return parts.filter(part => part).join('  ')
}

// urql prefixes a GraphQL error message with its kind ('[GraphQL] ')
export const readable = (message: string) => message.replace(/^\[\w+]\s*/, '')

// YouTube's `t` parameter is minted both as a bare count of seconds ('90', '90s') and in the compound form ('1h2m3s')
/**
 * YouTube's `t` parameter, in seconds.
 *
 * Accepts both forms upstream mints: a bare count of seconds ('90', '90s') and
 * the compound form ('1h2m3s', '1m30s'). Returns undefined for anything else,
 * so a malformed parameter starts the video at the beginning rather than at
 * NaN, which reads as a player that refuses to start.
 */
export const parseStartSeconds = (value: string | null | undefined) => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^\d+s?$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10)
    return Number.isFinite(seconds) ? seconds : undefined
  }
  const compound = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!compound || compound[0] === '') return undefined
  const [, hours, minutes, seconds] = compound
  // all three groups are optional, so a string of pure letters matches with every group empty
  if (hours === undefined && minutes === undefined && seconds === undefined) return undefined
  return Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)
}

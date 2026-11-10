import type { SourceSearchSuggestion } from '../types'

import { Constants } from 'youtubei.js/web'

// youtube.com's own names for an entity's fields (measured 2026-11-10): display name, what it is, photo, channel id
type Entity = { zao?: unknown, zaf?: unknown, zai?: unknown, zav?: unknown }

type Row = [query: string, type: number, features?: number[], entity?: Entity]

/** The request youtubei.js's `getSearchSuggestions` sends, whose answer it cuts down to each suggestion's text. */
export const searchSuggestionsUrl = (query: string, previousQuery: string | undefined, { hl, gl }: { hl: string, gl: string }) => {
  const url = new URL(`${Constants.URLS.YT_SUGGESTIONS}/complete/search`)
  url.searchParams.set('client', 'youtube')
  url.searchParams.set('gs_ri', 'youtube')
  url.searchParams.set('gs_id', '0')
  url.searchParams.set('cp', '0')
  url.searchParams.set('ds', 'yt')
  url.searchParams.set('sugexp', Constants.CLIENTS.WEB.SUGG_EXP_ID)
  url.searchParams.set('hl', hl)
  url.searchParams.set('gl', gl)
  url.searchParams.set('q', query)
  if (previousQuery) url.searchParams.set('pq', previousQuery)
  return url.href
}

const text = (value: unknown) => typeof value === 'string' && value !== '' ? value : undefined

/**
 * The suggestions in an answer to `searchSuggestionsUrl`, read in the charset its content type names, since that
 * follows `hl` (ISO-8859-1 for `en`, Shift_JIS for `ja`, measured 2026-11-10) and `Response.text()` reads only UTF-8.
 */
export const readSearchSuggestions = async (response: Response): Promise<SourceSearchSuggestion[]> => {
  const charset = /charset=([^;]+)/i.exec(response.headers.get('content-type') ?? '')?.[1]?.trim() ?? 'utf-8'
  const body = new TextDecoder(charset).decode(await response.arrayBuffer())
  const [, rows] = JSON.parse(body.slice(body.indexOf('(') + 1, body.lastIndexOf(')'))) as [string, Row[]]
  return rows.map(([query, , , entity]) => {
    const name = text(entity?.zao)
    return name ? { query, name, description: text(entity?.zaf), photo: text(entity?.zai), channelId: text(entity?.zav) } : { query }
  })
}

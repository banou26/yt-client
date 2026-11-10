import type { SourceBylinePart, SourceChannel, SourceChannelAbout, SourceChannelCard, SourceChannelShelf, SourceChapter, SourceGame, SourceNotification, SourceTextRun, SourceComment, SourceLikeStatus, SourceLiveChatMessage, SourceLiveChatRun, SourceMix, SourceMusicSection, SourcePost, SourceNotificationLevel, SourcePlaylist, SourcePlaylistItem, SourceSearchCard, SourceSearchShelf, SourceSession, SourceTranscript, SourceTranscriptLine, SourceTranscriptPanel, SourceVideo, SourceWatchMeta, SourceWatchPlaylist } from '../types'

type Thumbnail = {
  url?: string
  width?: number
}

type Text = {
  text?: string
  toString?: () => string
  endpoint?: { payload?: { browseId?: string } }
  runs?: RunNode[]
}

type RunNode = {
  text?: string
  bold?: boolean
  attachment?: { element?: { type?: { imageType?: { image?: { sources?: { clientResource?: { imageName?: string } }[] } } } } }
  endpoint?: {
    payload?: {
      url?: string
      videoId?: string
      startTimeSeconds?: number
      browseId?: string
    }
  }
}

type Author = {
  id?: string
  name?: string
  thumbnails?: Thumbnail[]
  url?: string
  is_verified?: boolean
  is_verified_artist?: boolean
  endpoint?: CollaboratorsEndpoint
}

type ChoiceItem = {
  title?: Text
  subtitle?: Text
  leading_accessory?: { image?: Thumbnail[] }
  renderer_context?: { command_context?: { on_tap?: { payload?: { browseId?: string } } } }
  // only on a watch page's owner
  trailing_buttons?: { is_signed_out?: boolean, subscribe_button_content?: { subscribe_state_subscribed?: boolean } }[]
}

// the Collaborators dialog a collaboration's avatars open, and on a watch page its names and Subscribe too
type CollaboratorsEndpoint = { command?: { inline_content?: { custom_content?: { items?: ChoiceItem[] } } } }

type FeedVideo = {
  id?: string
  video_id?: string
  title?: string | Text
  description?: string
  description_snippet?: Text
  // a search row's description excerpt, with the words that matched the query as bold runs
  snippets?: { text?: Text }[]
  thumbnails?: Thumbnail[]
  best_thumbnail?: Thumbnail
  duration?: { seconds?: number }
  length_text?: Text
  view_count?: Text
  short_view_count?: Text
  published?: Text
  author?: Author
  is_live?: boolean
  is_upcoming?: boolean
  badges?: { label?: string, text?: string, style?: string }[]
  thumbnail_overlays?: { type?: string, icon_type?: string }[]
  expandable_metadata?: {
    header?: { expanded_title?: Text }
    expanded_content?: { cards?: { title?: Text, time_description?: Text, thumbnail?: Thumbnail[] }[] }
  }
}

type VideoDetails = {
  id?: string
  title?: string
  short_description?: string
  duration?: number
  view_count?: number
  channel_id?: string
  author?: string
  thumbnail?: Thumbnail[]
  is_live?: boolean
}

type MetadataParts = {
  metadata_rows?: {
    // icon_name and leading_icon_name are this repo's patch of youtubei.js (patches/), which otherwise drops a part's icons
    metadata_parts?: { text?: Text, icon_name?: string, leading_icon_name?: string }[]
    badges?: { style?: string }[]
  }[]
  delimiter?: string
}

type ChannelHeader = {
  // a game channel's header: its name and its box art
  title?: Text
  box_art?: Thumbnail[]
  author?: { thumbnails?: Thumbnail[], is_verified?: boolean, is_verified_artist?: boolean }
  banner?: Thumbnail[]
  subscribers?: Text
  videos_count?: Text
  channel_handle?: Text
  content?: {
    title?: { text?: Text }
    banner?: { image?: Thumbnail[] }
    image?: { image?: Thumbnail[], avatar?: { image?: Thumbnail[] } }
    animated_image?: { image?: Thumbnail[] }
    metadata?: MetadataParts
    description?: { description?: Text }
  }
  // a carousel header's slides, then its TopicChannelDetails
  contents?: { type?: string, title?: Text, avatar?: Thumbnail[], subtitle?: Text }[]
}

// state_entity_store_key and entity_mutations are this repo's patch of youtubei.js (patches/), which otherwise drops both
export type EntityMutation = { payload?: { subscriptionStateEntity?: { key?: string, subscribed?: boolean } } }

type ChannelDetails = {
  header?: ChannelHeader
  metadata?: {
    external_id?: string
    title?: string
    description?: string
    avatar?: Thumbnail[]
    thumbnail?: Thumbnail[]
  }
  subscribe_button?: {
    subscribed?: boolean
    notification_preference_button?: { current_state_id?: string | number }
  }
  page?: {
    header_memo?: Map<string, { state_entity_store_key?: string }[]>
    entity_mutations?: EntityMutation[]
  }
}

type WatchNextMemo = {
  get(type: string): unknown[] | undefined
}

type WatchNextResponse = {
  contents_memo?: WatchNextMemo
}

type LockupOverlay = {
  type?: string
  badges?: { text?: string, badge_style?: string, icon_name?: string }[]
  position?: string
  progress_bar?: { start_percent?: number }
  thumbnail?: Thumbnail[]
}

type LockupVideo = {
  content_id?: string
  content_type?: string
  content_image?: {
    image?: Thumbnail[]
    overlays?: LockupOverlay[]
    primary_thumbnail?: {
      image?: Thumbnail[]
      overlays?: LockupOverlay[]
    }
  }
  metadata?: {
    title?: Text
    image?: {
      avatar?: { image?: Thumbnail[] }
      renderer_context?: { command_context?: { on_tap?: CollaboratorsEndpoint & { payload?: { browseId?: string } } } }
    }
    metadata?: MetadataParts
  }
  renderer_context?: { command_context?: { on_tap?: { payload?: { videoId?: string } } } }
}

type PlaylistVideoNode = FeedVideo & {
  index?: Text
  set_video_id?: string
  video_info?: Text
  style?: string
}

type GridPlaylistNode = {
  id?: string
  title?: string | Text
  thumbnails?: Thumbnail[]
  sidebar_thumbnails?: Thumbnail[]
  thumbnail_renderer?: { thumbnail?: Thumbnail[] }
  video_count?: Text
  video_count_short?: Text
  author?: Author | Text
}

type PlaylistPanelVideoNode = {
  video_id?: string
  title?: Text
  thumbnail?: Thumbnail[]
  duration?: { text?: string, seconds?: number }
  author?: string
  selected?: boolean
  set_video_id?: string
  primary?: PlaylistPanelVideoNode
}

type WatchNextPlaylistPanel = {
  id?: string
  title?: string
  author?: Author | Text
  contents?: unknown[]
  current_index?: number
  is_infinite?: boolean
}

type PlaylistDetails = {
  info?: {
    title?: string
    description?: string
    author?: Author
    thumbnails?: Thumbnail[]
    total_items?: string
    views?: string
    last_updated?: string
    privacy?: string
    is_editable?: boolean
    can_delete?: boolean
    can_reorder?: boolean
  }
}

type AccountItemNode = {
  account_name?: Text
  account_photo?: Thumbnail[]
  channel_handle?: Text
  is_selected?: boolean
  has_channel?: boolean
  // selectActiveIdentityEndpoint's: only a brand channel's row has a pageIdToken (measured 2026-11-06)
  endpoint?: { payload?: { supportedTokens?: { pageIdToken?: { pageId?: string } }[] } }
}

type CommentViewNode = {
  comment_id?: string
  content?: Text
  published_time?: string
  like_count?: string
  reply_count?: string
  is_pinned?: boolean
  is_hearted?: boolean
  is_liked?: boolean
  is_disliked?: boolean
  author_is_channel_owner?: boolean
  is_member?: boolean
  author?: Author
}

type CommentThread = {
  comment?: CommentViewNode
}

const text = (value: string | Text | undefined) => {
  if (typeof value === 'string') return value
  if (value?.text) return value.text
  return value?.toString?.()
}

// youtubei.js Text instances stringify empty values as 'N/A': treat that as absent.
const presentText = (value: string | Text | undefined) => {
  const result = text(value)
  return result === 'N/A' ? undefined : result
}

// `minWidth` is the narrowest candidate that covers the slot at 2x; omitting it takes the widest
const thumbnail = (items: Thumbnail[] | undefined, minWidth?: number) => {
  const sorted = items
    ?.filter((item): item is Thumbnail & { url: string } => Boolean(item.url))
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  if (!sorted?.length) return undefined
  const covering = minWidth === undefined
    ? undefined
    : sorted.find((item) => (item.width ?? 0) >= minWidth)
  return (covering ?? sorted[sorted.length - 1])?.url
}

// only widths upstream actually published are listed: a fabricated entry is a broken image
const srcset = (items: Thumbnail[] | undefined) => {
  const described = items?.filter(
    (item): item is Thumbnail & { url: string, width: number } =>
      Boolean(item.url) && Number.isFinite(item.width) && (item.width ?? 0) > 0,
  )
  if (!described || described.length < 2) return undefined
  // deduped by width: upstream publishes the same size more than once, and a repeated descriptor is invalid
  const byWidth = new Map(described.map((item) => [item.width, item.url]))
  return [...byWidth]
    .sort((a, b) => a[0] - b[0])
    .map(([width, url]) => `${url} ${width}w`)
    .join(', ')
}

// a channel photo renders at 80px at most, so 160 covers it at 2x
const AVATAR_WIDTH = 160

// a grid card is roughly 360px wide, so 720 covers it at 2x
const STILL_WIDTH = 720

const durationSeconds = (value: string | undefined) => {
  const parts = value?.split(':').map(Number)
  if (!parts?.length || parts.some((part) => !Number.isFinite(part))) return undefined
  return parts.reduce((total, part) => total * 60 + part, 0)
}

const duration = (video: FeedVideo) => {
  if (Number.isFinite(video.duration?.seconds)) return video.duration?.seconds
  return durationSeconds(text(video.length_text))
}

/** A count as upstream abbreviates it ('6.7K', '1,234 views'), as a whole number; undefined when the text does not start with one. */
export const approximateCount = (value: string | undefined) => {
  const match = value?.replaceAll(',', '').match(/^([\d.]+)\s*([KMB])?/i)
  if (!match) return undefined
  const base = Number(match[1])
  if (!Number.isFinite(base)) return undefined
  const scale = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[match[2]?.toUpperCase() ?? ''] ?? 1
  return Math.round(base * scale)
}

const handleFromUrl = (url: string | undefined) => url?.match(/\/(@[^/?#]+)/)?.[1]

const LIKE_STATUSES: SourceLikeStatus[] = ['LIKE', 'DISLIKE', 'INDIFFERENT']

const likeStatus = (value: unknown): SourceLikeStatus | undefined =>
  LIKE_STATUSES.find((status) => status === value)

const NOTIFICATION_LEVELS: SourceNotificationLevel[] = ['ALL', 'PERSONALIZED', 'NONE']

// the state arrives as a style id whose tail is the level; an unknown one reads as absent, never as NONE
const notificationLevel = (value: unknown): SourceNotificationLevel | undefined => {
  if (typeof value !== 'string') return undefined
  const upper = value.toUpperCase()
  return NOTIFICATION_LEVELS.find((level) => upper.endsWith(level))
}

const metadataTexts = (metadata: MetadataParts | undefined) =>
  metadata?.metadata_rows
    ?.flatMap((row) => row.metadata_parts ?? [])
    .map((part) => text(part.text))
    .filter((value): value is string => Boolean(value))
    ?? []

// a lockup or a page header names its badge by icon rather than by an author badge style
const VERIFIED_ICONS = new Set(['CHECK_CIRCLE_FILLED', 'CHECK_CIRCLE_THICK'])
const ARTIST_ICONS = new Set(['AUDIO_BADGE', 'OFFICIAL_ARTIST_BADGE'])

// the outlined play arrow youtube.com draws before a lockup's view count (measured 2026-11-10)
const VIEW_COUNT_ICONS = new Set(['PLAY_ARROW_OUTLINED'])

const iconBadges = (names: (string | undefined)[]): Pick<SourceChannel, 'isVerified' | 'isVerifiedArtist'> => ({
  isVerified: names.some((name) => name !== undefined && VERIFIED_ICONS.has(name)) ? true : undefined,
  isVerifiedArtist: names.some((name) => name !== undefined && ARTIST_ICONS.has(name)) ? true : undefined,
})

const authorBadges = (author: Pick<Author, 'is_verified' | 'is_verified_artist'> | undefined) => ({
  isVerified: author?.is_verified === true ? true : undefined,
  isVerifiedArtist: author?.is_verified_artist === true ? true : undefined,
})

const runIcons = (value: Text | undefined) =>
  (value?.runs ?? []).flatMap((run) => run.attachment?.element?.type?.imageType?.image?.sources ?? [])
    .map((source) => source.clientResource?.imageName)

const authorChannel = (author: Author | undefined): SourceChannel | undefined => {
  const id = presentText(author?.id)
  const name = presentText(author?.name)
  if (!id || !name) return undefined
  return {
    id,
    name,
    avatar: thumbnail(author?.thumbnails, AVATAR_WIDTH),
    handle: handleFromUrl(author?.url),
    ...authorBadges(author),
  }
}

const badgeTexts = (badges: { label?: string, text?: string }[] | undefined) =>
  (badges ?? [])
    .map((badge) => presentText(badge.label) ?? presentText(badge.text))
    .filter((value): value is string => Boolean(value))

const hasBadgeStyle = (badges: { style?: string }[] | undefined, fragment: string) =>
  (badges ?? []).some((badge) => badge.style?.includes(fragment))

// a choice row's subtitle is '@mkbhd • 21.4M subscribers', wrapped in direction marks
const DIRECTION_MARKS = /[\u200e\u200f\u2066-\u2069]/g

const collaboratorChannels = (endpoint: CollaboratorsEndpoint | undefined): SourceChannel[] =>
  (endpoint?.command?.inline_content?.custom_content?.items ?? []).flatMap((item) => {
    // a watch page's row links its name instead of the whole row
    const id = item.renderer_context?.command_context?.on_tap?.payload?.browseId ?? item.title?.endpoint?.payload?.browseId
    const name = presentText(item.title)
    if (!id || !name) return []
    const details = (text(item.subtitle) ?? '').replace(DIRECTION_MARKS, '').split(' • ')
    const subscribe = item.trailing_buttons?.[0]
    return [{
      id,
      name,
      avatar: thumbnail(item.leading_accessory?.image, AVATAR_WIDTH),
      handle: details.find((detail) => detail.startsWith('@')),
      subscriberCountText: details.find((detail) => detail.length > 0 && !detail.startsWith('@')),
      ...iconBadges(runIcons(item.title)),
      // signed out the state still reads false, which SubscribeButton would take for a signed-in answer
      isSubscribed: subscribe && subscribe.is_signed_out !== true ? subscribe.subscribe_button_content?.subscribe_state_subscribed : undefined,
    }]
  })

const bylinePart = (value: string, badges?: Pick<SourceChannel, 'isVerified' | 'isVerifiedArtist'>): SourceBylinePart => ({
  text: value,
  isVerified: badges?.isVerified,
  isVerifiedArtist: badges?.isVerifiedArtist,
})

type Byline = Pick<SourceVideo, 'channel' | 'byline' | 'collaborators'>

// A search row prints a collaboration's names as one run ('Cleo Abram and Marques Brownlee'), cut here after the first
// name so each name is badged as a lockup's parts are. A later name can hold 'and' ('Colin and Samir and 2 more').
const authorByline = (author: Author | undefined): Byline => {
  const collaborators = collaboratorChannels(author?.endpoint)
  const name = presentText(author?.name)
  const [first] = collaborators
  const last = collaborators.at(-1)
  if (!first || !last || collaborators.length < 2 || !name) return { channel: authorChannel(author) }
  const rest = name.startsWith(`${first.name} `) ? name.slice(first.name.length + 1) : undefined
  return {
    channel: first,
    byline: rest ? [bylinePart(first.name, first), bylinePart(rest, rest.endsWith(last.name) ? last : undefined)] : [bylinePart(name)],
    collaborators,
  }
}

const bylineChannel = (author: Author | Text | undefined): SourceChannel | undefined => {
  const fromAuthor = authorChannel(author as Author | undefined)
  if (fromAuthor) return fromAuthor
  const byline = author as Text | undefined
  const id = byline?.endpoint?.payload?.browseId
  const name = presentText(byline?.text)
  return id && name ? { id, name } : undefined
}

// a row with no parts carries only badges (CC, 4K)
const lockupRows = (lockup: LockupVideo) =>
  (lockup.metadata?.metadata?.metadata_rows ?? [])
    .map((row) => row.metadata_parts ?? [])
    .filter((parts) => parts.length > 0)

type LockupPart = ReturnType<typeof lockupRows>[number][number]

// The byline leads the first row: alone above the views and date (watch next, shelves) or ahead of them on the one row
// (search, history). A channel's own videos, on its Home shelves and its tabs, have no byline but a collaboration's
// names: their one row ends in the views and date, and their avatar still taps through to the channel, so read as a
// byline that row named the channel '784K'.
const lockupLines = (lockup: LockupVideo, own: boolean): { byline: LockupPart[], stats: LockupPart[] } => {
  const rows = lockupRows(lockup)
  if (rows.length > 1) return { byline: rows[0] ?? [], stats: rows[1] ?? [] }
  const parts = rows[0] ?? []
  if (own) return { byline: parts.slice(0, -2), stats: parts.slice(-2) }
  // a collaboration's later names are parts of their own ('and Invicta')
  const names = parts.findIndex((part, index) => index > 0 && !presentText(part.text)?.startsWith('and '))
  const end = names === -1 ? parts.length : names
  return { byline: parts.slice(0, end), stats: parts.slice(end) }
}

const lockupChannel = (lockup: LockupVideo, byline: LockupPart | undefined): SourceChannel | undefined => {
  const name = text(byline?.text)
  const id = byline?.text?.endpoint?.payload?.browseId
    ?? lockup.metadata?.image?.renderer_context?.command_context?.on_tap?.payload?.browseId
  if (!id || !name) return undefined
  return {
    id,
    name,
    avatar: thumbnail(lockup.metadata?.image?.avatar?.image, AVATAR_WIDTH),
    ...iconBadges([byline?.icon_name]),
  }
}

// a collaboration's names are one part each ('Marques Brownlee', 'and Auto Focus'), and none of them links
const lockupByline = (lockup: LockupVideo, parts: LockupPart[]): Byline => {
  if (parts.length < 2) return { channel: lockupChannel(lockup, parts[0]) }
  const collaborators = collaboratorChannels(lockup.metadata?.image?.renderer_context?.command_context?.on_tap)
  return {
    channel: collaborators[0],
    byline: parts.flatMap((part) => {
      const value = presentText(part.text)
      return value ? [bylinePart(value, iconBadges([part.icon_name]))] : []
    }),
    collaborators: collaborators.length > 0 ? collaborators : undefined,
  }
}

// a page header's button carries only a key, and the state it names arrives in the response's entity store
const storedSubscribed = (mutations: EntityMutation[] | undefined, key: string | undefined) => {
  if (!key) return undefined
  return mutations
    ?.find((mutation) => mutation.payload?.subscriptionStateEntity?.key === key)
    ?.payload?.subscriptionStateEntity?.subscribed
}

const headerSubscribed = (channel: ChannelDetails) =>
  storedSubscribed(channel.page?.entity_mutations, channel.page?.header_memo?.get('SubscribeButtonView')?.[0]?.state_entity_store_key)

export const normalizeChannel = (input: unknown, fallbackId?: string): SourceChannel => {
  const channel = input as ChannelDetails
  const id = channel.metadata?.external_id ?? fallbackId
  if (!id) throw new Error('youtube: channel response has no id')
  const header = channel.header
  const view = header?.content
  const parts = metadataTexts(view?.metadata)
  const handle = text(header?.channel_handle) ?? parts.find((part) => part.startsWith('@'))
  const details = parts.filter((part) => part !== handle)
  // the legacy header badges its author, the page header its title
  const fromAuthor = authorBadges(header?.author)
  const fromTitle = iconBadges(runIcons(view?.title?.text))
  // the name youtube.com shows is the header's: Music's carousel says "Music" where its metadata says "The Music Channel",
  // a game's header "Grand Theft Auto V" where it says "Grand Theft Auto V - Topic", and Live's page header is all it has
  const topic = header?.contents?.find((node) => node.type === 'TopicChannelDetails')
  return {
    id,
    name: presentText(topic?.title) ?? presentText(header?.title) ?? channel.metadata?.title ?? presentText(view?.title?.text) ?? id,
    avatar: thumbnail(channel.metadata?.avatar ?? channel.metadata?.thumbnail, AVATAR_WIDTH)
      ?? thumbnail(header?.author?.thumbnails, AVATAR_WIDTH)
      ?? thumbnail(view?.image?.avatar?.image ?? view?.image?.image ?? view?.animated_image?.image, AVATAR_WIDTH)
      ?? thumbnail(topic?.avatar ?? header?.box_art, AVATAR_WIDTH),
    handle,
    subscriberCountText: text(header?.subscribers) ?? details[0] ?? presentText(topic?.subtitle),
    videoCountText: text(header?.videos_count) ?? details[1],
    banner: thumbnail(header?.banner) ?? thumbnail(view?.banner?.image),
    description: channel.metadata?.description ?? text(view?.description?.description),
    isSubscribed: headerSubscribed(channel) ?? channel.subscribe_button?.subscribed,
    notificationLevel: notificationLevel(channel.subscribe_button?.notification_preference_button?.current_state_id),
    isVerified: fromAuthor.isVerified ?? fromTitle.isVerified,
    isVerifiedArtist: fromAuthor.isVerifiedArtist ?? fromTitle.isVerifiedArtist,
  }
}

export const normalizeFeedChannel = (input: unknown): SourceChannel | undefined => {
  const node = input as {
    id?: string
    author?: Author
    subscribers?: Text
    video_count?: Text
  }
  const id = node.author?.id ?? node.id
  const name = node.author?.name
  if (!id || !name) return undefined
  return {
    id,
    name,
    avatar: thumbnail(node.author?.thumbnails, AVATAR_WIDTH),
    handle: handleFromUrl(node.author?.url),
    subscriberCountText: presentText(node.subscribers),
    videoCountText: presentText(node.video_count),
  }
}

export const normalizeSearchChannel = (input: unknown): SourceChannel | undefined => {
  const node = input as {
    id?: string
    author?: Author
    subscriber_count?: Text
    video_count?: Text
    description_snippet?: Text
    subscribe_button?: { subscribed?: boolean }
  }
  const id = node.id ?? presentText(node.author?.id)
  const name = presentText(node.author?.name)
  if (!id || !name) return undefined
  // MISNAMED upstream (youtubei.js parser/classes/Channel.js:25): subscriber_count holds the handle, video_count the subscriber count
  const handle = handleFromUrl(node.author?.url) ?? presentText(node.subscriber_count)
  return {
    id,
    name,
    avatar: thumbnail(node.author?.thumbnails, AVATAR_WIDTH),
    handle: handle?.startsWith('@') ? handle : undefined,
    subscriberCountText: presentText(node.video_count),
    description: presentText(node.description_snippet),
    isSubscribed: node.subscribe_button?.subscribed,
    ...authorBadges(node.author),
  }
}

/** A link's destination: youtube.com sends every link out through its /redirect page, which carries it in `q`. Only http(s). */
export const outboundUrl = (url: string | undefined) => {
  try {
    const parsed = new URL(url ?? '')
    const target = parsed.hostname === 'www.youtube.com' && parsed.pathname === '/redirect'
      ? new URL(parsed.searchParams.get('q') ?? '')
      : parsed
    return target.protocol === 'https:' || target.protocol === 'http:' ? target.href : undefined
  } catch {
    return undefined
  }
}

export const normalizeChannelAbout = (input: unknown): SourceChannelAbout | undefined => {
  const node = input as {
    metadata?: {
      description?: string
      country?: string
      joined_date?: Text
      view_count?: string
      subscriber_count?: string
      video_count?: string
      canonical_channel_url?: string
      links?: { title?: Text, link?: Text & { endpoint?: { payload?: { url?: string } } } }[]
    }
    description?: Text
    country?: Text
    joined_date?: Text
    view_count?: Text
    canonical_channel_url?: string
    primary_links?: { title?: Text, endpoint?: { metadata?: { url?: string } } }[]
  } | undefined
  if (!node) return undefined
  const view = node.metadata
  if (view) {
    return {
      description: presentText(view.description),
      country: presentText(view.country),
      joinedDateText: presentText(view.joined_date),
      viewCountText: presentText(view.view_count),
      subscriberCountText: presentText(view.subscriber_count),
      videoCountText: presentText(view.video_count),
      canonicalUrl: view.canonical_channel_url,
      links: (view.links ?? []).flatMap((link) => {
        const title = presentText(link.title)
        // the shortened form upstream shows, such as lnk.to/abc
        const displayUrl = presentText(link.link)
        const url = outboundUrl(link.link?.endpoint?.payload?.url) ?? outboundUrl(displayUrl && `https://${displayUrl}`)
        return title && url ? [{ title, url, displayUrl }] : []
      }),
    }
  }
  const legacy = node
  // the legacy renderer carries no counts beyond views, so those stay absent rather than back-filled
  const about: SourceChannelAbout = {
    description: presentText(legacy.description),
    country: presentText(legacy.country),
    joinedDateText: presentText(legacy.joined_date),
    viewCountText: presentText(legacy.view_count),
    canonicalUrl: legacy.canonical_channel_url,
    links: (legacy.primary_links ?? []).flatMap((link) => {
      const title = presentText(link.title)
      const url = outboundUrl(link.endpoint?.metadata?.url)
      return title && url ? [{ title, url }] : []
    }),
  }
  return Object.values(about).some((value) => value !== undefined && value.length !== 0) ? about : undefined
}

export const normalizeCommunityPost = (input: unknown): SourcePost | undefined => {
  const node = input as {
    id?: string
    author?: Author
    content?: Text
    published?: Text
    vote_count?: Text
    action_buttons?: { reply_button?: { text?: string, label?: string } }
    attachment?: unknown
  } | undefined
  const id = node?.id
  if (!id) return undefined
  const attachment = node?.attachment as {
    image?: Thumbnail[]
    thumbnails?: Thumbnail[]
  } | undefined
  return {
    id,
    author: authorChannel(node?.author),
    text: presentText(node?.content) ?? '',
    publishedText: presentText(node?.published),
    voteCountText: presentText(node?.vote_count),
    commentCountText: presentText(node?.action_buttons?.reply_button?.text),
    commentCountLabel: presentText(node?.action_buttons?.reply_button?.label),
    // guarded because normalizeFeedVideo takes a node rather than a maybe-node and throws on undefined
    attachedVideo: node?.attachment === undefined ? undefined : normalizeFeedVideo(node.attachment),
    attachedImage: thumbnail(attachment?.image ?? attachment?.thumbnails),
  }
}

// deliberately NOT Text.toHTML(): that returns a markup string, and rendering it injects upstream HTML into the tree
export const normalizeRuns = (value: string | Text | undefined): SourceTextRun[] => {
  if (typeof value === 'string') return value.length > 0 ? [{ text: value }] : []
  const runs = (value as { runs?: RunNode[] } | undefined)?.runs
  if (!runs || runs.length === 0) {
    const flat = presentText(value)
    return flat ? [{ text: flat }] : []
  }
  return runs.flatMap((run) => {
    const runText = run.text
    if (!runText) return []
    const payload = run.endpoint?.payload
    const startSeconds = payload?.startTimeSeconds
    return [{
      text: runText,
      bold: run.bold === true ? true : undefined,
      url: payload?.url,
      videoId: payload?.videoId,
      startSeconds: typeof startSeconds === 'number' && Number.isFinite(startSeconds) ? startSeconds : undefined,
      browseId: payload?.browseId,
    }]
  })
}

export const normalizeNotification = (input: unknown): SourceNotification | undefined => {
  const node = input as {
    notification_id?: string
    short_message?: Text
    sent_time?: Text
    thumbnails?: Thumbnail[]
    video_thumbnails?: Thumbnail[]
    endpoint?: { payload?: { videoId?: string } }
    read?: boolean
  } | undefined
  const id = node?.notification_id
  const message = presentText(node?.short_message)
  if (!id || !message) return undefined
  return {
    id,
    message,
    sentText: presentText(node?.sent_time),
    // `thumbnails` is the channel avatar and `video_thumbnails` the still, never one list
    avatar: thumbnail(node?.thumbnails, AVATAR_WIDTH),
    thumbnail: thumbnail(node?.video_thumbnails, STILL_WIDTH),
    videoId: node?.endpoint?.payload?.videoId,
    read: node?.read === true ? true : undefined,
  }
}

const clampPercent = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : undefined

const legacyProgressPercent = (input: unknown) => {
  const overlays = (input as { thumbnail_overlays?: { percent_duration_watched?: number }[] }).thumbnail_overlays ?? []
  return overlays.map((overlay) => clampPercent(overlay.percent_duration_watched)).find((value) => value !== undefined)
}

const lockupProgressPercent = (image: {
  overlays?: { progress_bar?: { start_percent?: number } }[]
} | undefined) =>
  (image?.overlays ?? []).map((overlay) => clampPercent(overlay.progress_bar?.start_percent)).find((value) => value !== undefined)

// a search row's strip under the description, which holds an AI summary instead on some videos
const searchChapters = (metadata: FeedVideo['expandable_metadata']) => {
  const chapters = (metadata?.expanded_content?.cards ?? []).flatMap((card) => {
    const title = presentText(card.title)
    const start = durationSeconds(text(card.time_description))
    return title && start !== undefined
      ? [{ title, startSeconds: start, thumbnail: thumbnail(card.thumbnail) }]
      : []
  })
  return chapters.length > 0
    ? { chapters, chaptersTitle: presentText(metadata?.header?.expanded_title) }
    : undefined
}

export const normalizeFeedVideo = (input: unknown): SourceVideo | undefined => {
  const video = input as FeedVideo
  const id = video.video_id ?? video.id
  const title = text(video.title)
  if (!id || !title) return undefined
  const snippetRuns = video.snippets?.flatMap((snippet) => normalizeRuns(snippet.text))
  return {
    id,
    title,
    description: video.description ?? text(video.description_snippet),
    descriptionSnippet: text(video.description_snippet),
    snippetRuns: snippetRuns?.length ? snippetRuns : undefined,
    thumbnail: video.best_thumbnail?.url ?? thumbnail(video.thumbnails, STILL_WIDTH),
    thumbnailSrcset: srcset(video.thumbnails),
    durationSeconds: duration(video),
    isMusic: video.thumbnail_overlays?.some((overlay) => overlay.type === 'ThumbnailOverlayTimeStatus' && overlay.icon_type === 'MUSIC')
      ? true
      : undefined,
    viewCount: text(video.short_view_count ?? video.view_count),
    // a live VideoCard's one line holds no date, which youtubei.js reads as 'N/A'
    publishedText: presentText(video.published),
    isLive: video.is_live === true ? true : undefined,
    progressPercent: legacyProgressPercent(video),
    isUpcoming: video.is_upcoming === true ? true : undefined,
    isMembersOnly: hasBadgeStyle(video.badges, 'MEMBERS_ONLY') ? true : undefined,
    badges: badgeTexts(video.badges),
    ...authorByline(video.author),
    ...searchChapters(video.expandable_metadata),
  }
}

export const normalizeShortsLockup = (input: unknown): SourceVideo | undefined => {
  const node = input as {
    entity_id?: string
    thumbnail?: Thumbnail[]
    content_image?: { image?: Thumbnail[], primary_thumbnail?: { image?: Thumbnail[] } }
    thumbnail_view_model?: { image?: Thumbnail[] }
    on_tap_endpoint?: { payload?: { videoId?: string } }
    overlay_metadata?: { primary_text?: Text, secondary_text?: Text }
    accessibility_text?: string
    badge?: { label?: string, text?: string }
  } | undefined
  const id = node?.on_tap_endpoint?.payload?.videoId ?? node?.entity_id
  const title = presentText(node?.overlay_metadata?.primary_text) ?? node?.accessibility_text
  if (!id || !title) return undefined
  // i.ytimg.com/vi/ID/hqdefault.jpg is the canonical still for any public video id, used when the node carries none.
  // It and a feed lockup's own still letterbox the vertical frame, so a portrait tile crops into their bars; the
  // thumbnail view's image is the portrait frame itself (405x608 on a channel's Shorts tab, 2026-11-10), and the reel
  // endpoint's poster is the true 1080x1920 frame and wins wherever it exists
  const image = thumbnail(node?.thumbnail_view_model?.image)
    ?? thumbnail(node?.thumbnail)
    ?? thumbnail(node?.content_image?.primary_thumbnail?.image ?? node?.content_image?.image)
    ?? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`
  return {
    id,
    title,
    thumbnail: image,
    // no durationSeconds: Shorts carry no length on this node and a card should not show one
    viewCount: presentText(node?.overlay_metadata?.secondary_text),
    isShort: true,
    badges: badgeTexts(node?.badge ? [node.badge] : undefined),
  }
}

export const normalizeVideoDetails = (input: unknown): SourceVideo | undefined => {
  const video = input as VideoDetails
  if (!video.id || !video.title) return undefined
  return {
    id: video.id,
    title: video.title,
    description: video.short_description,
    thumbnail: thumbnail(video.thumbnail, STILL_WIDTH),
    thumbnailSrcset: srcset(video.thumbnail),
    durationSeconds: video.duration,
    viewCount: video.view_count === undefined ? undefined : String(video.view_count),
    isLive: video.is_live === true ? true : undefined,
    badges: [],
    channel: video.channel_id && video.author
      ? { id: video.channel_id, name: video.author }
      : undefined,
  }
}

// an explicit allow-list rather than "not VIDEO" so a playlist lockup falls through to normalizePlaylistLockup instead of being swallowed here: the collection kinds have their own normalizers and must never be forced through this one
const VIDEO_LOCKUPS = new Set(['UNSPECIFIED', 'VIDEO', 'SHORT', 'CLIP', 'MOVIE'])

export const normalizeLockupVideo = (input: unknown, { own = false }: { own?: boolean } = {}): SourceVideo | undefined => {
  const lockup = input as LockupVideo
  if (!VIDEO_LOCKUPS.has(lockup.content_type ?? 'UNSPECIFIED')) return undefined
  const id = lockup.content_id
  const title = text(lockup.metadata?.title)
  if (!id || !title) return undefined
  const image = lockup.content_image?.primary_thumbnail ?? lockup.content_image
  const badges = image?.overlays?.flatMap((overlay) => overlay.badges ?? []) ?? []
  const length = badges.find((badge) => durationSeconds(badge.text) !== undefined)
  const { byline, stats } = lockupLines(lockup, own)
  const metadata = lockup.metadata?.metadata
  const rowBadges = metadata?.metadata_rows?.flatMap((row) => row.badges ?? []) ?? []
  return {
    id,
    title,
    thumbnail: thumbnail(image?.image, STILL_WIDTH),
    thumbnailSrcset: srcset(image?.image),
    animatedThumbnail: thumbnail(
      image?.overlays?.find((overlay) => overlay.type === 'AnimatedThumbnailOverlayView')?.thumbnail,
    ),
    thumbnailBadge: image?.overlays
      ?.filter((overlay) => overlay.position?.endsWith('_TOP_START'))
      .flatMap((overlay) => overlay.badges ?? [])
      .map((badge) => presentText(badge.text))
      .find((label) => Boolean(label)),
    durationSeconds: durationSeconds(length?.text),
    isMusic: length?.icon_name === 'MUSIC' ? true : undefined,
    viewCount: text(stats[0]?.text),
    viewCountIcon: VIEW_COUNT_ICONS.has(stats[0]?.leading_icon_name ?? '') ? true : undefined,
    publishedText: text(stats[1]?.text),
    // a collaboration's row sends none, and youtube.com draws only the gap there
    metaDelimiter: metadata?.delimiter ?? ' ',
    isLive: badges.some((badge) => badge.badge_style?.includes('LIVE')) ? true : undefined,
    progressPercent: lockupProgressPercent(image),
    isShort: lockup.content_type === 'SHORT' ? true : undefined,
    // youtube.com's lockups carry it as a badge on a line of its own under the date (measured 2026-11-10)
    isMembersOnly: hasBadgeStyle([...badges.map((badge) => ({ style: badge.badge_style })), ...rowBadges], 'MEMBERS_ONLY')
      ? true
      : undefined,
    // empty because a lockup's overlay badges carry only the length, the live pill and the corner label, all read above
    badges: [],
    ...lockupByline(lockup, byline),
  }
}

// an album's OLAK5uy_ id, a station's RDCLAK5uy_ one and a show's (a series a channel counts in episodes) PL one open at
// /playlist?list= like any playlist's
const PLAYLIST_LOCKUPS = new Set(['PLAYLIST', 'ALBUM', 'STATION', 'SHOW'])

export const normalizePlaylistLockup = (input: unknown): SourcePlaylist | undefined => {
  const lockup = input as LockupVideo
  if (!PLAYLIST_LOCKUPS.has(lockup.content_type ?? '')) return undefined
  const id = lockup.content_id
  const title = presentText(lockup.metadata?.title)
  if (!id || !title) return undefined
  const image = lockup.content_image?.primary_thumbnail ?? lockup.content_image
  const badges = image?.overlays?.flatMap((overlay) => overlay.badges ?? []) ?? []
  return {
    id,
    title,
    thumbnail: thumbnail(image?.image, STILL_WIDTH),
    videoCountText: badges.map((badge) => badge.text).find((value) => Boolean(value)),
    channel: lockupChannel(lockup, lockupRows(lockup)[0]?.[0]),
  }
}

export const normalizeGridPlaylist = (input: unknown): SourcePlaylist | undefined => {
  const node = input as GridPlaylistNode
  const id = node.id
  const title = presentText(node.title)
  if (!id || !title) return undefined
  return {
    id,
    title,
    thumbnail: thumbnail(node.thumbnails, STILL_WIDTH)
      ?? thumbnail(node.sidebar_thumbnails, STILL_WIDTH)
      ?? thumbnail(node.thumbnail_renderer?.thumbnail, STILL_WIDTH),
    videoCountText: presentText(node.video_count) ?? presentText(node.video_count_short),
    channel: bylineChannel(node.author),
  }
}

// A channel's Shows tab: the show is the playlist its browse opens (`VL` + the playlist id), counted in episodes
export const normalizeGridShow = (input: unknown): SourcePlaylist | undefined => {
  const node = input as {
    title?: Text
    thumbnail_renderer?: { thumbnail?: Thumbnail[] }
    endpoint?: { payload?: { browseId?: string } }
    thumbnail_overlays?: { text?: Text }[]
    author?: Author
  }
  const browseId = node.endpoint?.payload?.browseId
  const id = browseId?.startsWith('VL') ? browseId.slice(2) : undefined
  const title = presentText(node.title)
  if (!id || !title) return undefined
  return {
    id,
    title,
    thumbnail: thumbnail(node.thumbnail_renderer?.thumbnail, STILL_WIDTH),
    videoCountText: node.thumbnail_overlays?.map((overlay) => presentText(overlay.text)).find(Boolean),
    channel: bylineChannel(node.author),
  }
}

// A channel's Home tab heads with a player node rather than a lockup: it carries no still and no length.
export const normalizeFeaturedVideo = (input: unknown): SourceVideo | undefined => {
  const node = input as {
    id?: string
    title?: Text
    description?: Text
    view_count?: Text
    published_time?: Text
  } | undefined
  const id = node?.id
  const title = presentText(node?.title)
  if (!id || !title) return undefined
  return {
    id,
    title,
    description: presentText(node?.description),
    thumbnail: `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`,
    viewCount: presentText(node?.view_count),
    publishedText: presentText(node?.published_time),
    badges: [],
  }
}

// a box art is drawn 210px wide, so 420 covers it at 2x
const BOX_ART_WIDTH = 420

const normalizeGame = (input: unknown): SourceGame | undefined => {
  const game = (input as {
    game?: { title?: Text, box_art?: Thumbnail[], endpoint?: { payload?: { browseId?: string } } }
  }).game
  const id = game?.endpoint?.payload?.browseId
  const title = presentText(game?.title)
  return id && title ? { id, title, boxArt: thumbnail(game?.box_art, BOX_ART_WIDTH) } : undefined
}

// a topic channel's rows link to browses of their own (/channel/UC4R8DWoMoI7CAwX8_LjQHig/livetab?ss=CKEK) that no route
// here opens
const UNROUTED_ROW = /\/(livetab|sportstab)\b/

// Dispatched on the node type: a GridVideo also passes normalizeGridPlaylist's id-and-title check, and normalizeFeedChannel's author check.
export const normalizeChannelShelf = (input: unknown): SourceChannelShelf | undefined => {
  const node = input as {
    type?: string
    title?: Text
    subtitle?: Text
    header?: { title?: Text, subtitle?: Text }
    endpoint?: { metadata?: { url?: string } }
    content?: { items?: unknown[], contents?: unknown[] }
    items?: unknown[]
    contents?: unknown[]
    cards?: unknown[]
  } | undefined
  const title = presentText(node?.title) ?? presentText(node?.header?.title)
  if (!title) return undefined
  const url = node?.endpoint?.metadata?.url
  const rich = node?.type === 'RichShelf'
  const shelf: SourceChannelShelf = {
    title,
    subtitle: presentText(node?.subtitle) ?? presentText(node?.header?.subtitle),
    url: url?.startsWith('/') && !url.startsWith('//') && !UNROUTED_ROW.test(url) ? url : undefined,
    expandable: rich ? true : undefined,
    videos: [],
    shorts: [],
    playlists: [],
    channels: [],
    games: [],
    posts: [],
  }
  for (const entry of node?.content?.items ?? node?.content?.contents ?? node?.items ?? node?.contents ?? node?.cards ?? []) {
    const item = (entry as { type?: string }).type === 'RichItem' ? (entry as { content?: unknown }).content : entry
    const type = (item as { type?: string } | undefined)?.type
    if (type === 'LockupView') {
      const video = normalizeLockupVideo(item, { own: true })
      const playlist = video ? undefined : normalizePlaylistLockup(item)
      if (video && lockupLines(item as LockupVideo, true).byline.length === 0) shelf.uploads = true
      if (video) shelf.videos.push(video)
      if (playlist) shelf.playlists.push(playlist)
    } else if (type === 'GridVideo' || type === 'Video' || type === 'VideoCard') {
      const video = normalizeFeedVideo(item)
      if (video) shelf.videos.push(video)
    } else if (type === 'ShortsLockupView') {
      const short = normalizeShortsLockup(item)
      if (short) shelf.shorts.push(short)
    } else if (type === 'GridPlaylist' || type === 'Playlist') {
      const playlist = normalizeGridPlaylist(item)
      if (playlist) shelf.playlists.push(playlist)
    } else if (type === 'GridChannel') {
      const channel = normalizeFeedChannel(item)
      if (channel) shelf.channels.push(channel)
    } else if (type === 'GameCard') {
      const game = normalizeGame(item)
      if (game) shelf.games.push(game)
    } else if (type === 'Post' && rich) {
      // only a topic channel's rich row: a channel's own Home lays its posts sideways, which is not built here
      const post = normalizeCommunityPost(item)
      if (post) shelf.posts.push(post)
    }
  }
  const { videos, shorts, playlists, channels, games, posts } = shelf
  return videos.length + shorts.length + playlists.length + channels.length + games.length + posts.length > 0 ? shelf : undefined
}

type CardAction = {
  type?: string
  channel_id?: string
  state_entity_store_key?: string
  is_signed_out?: boolean
  on_tap?: { payload?: { browseId?: string } }
}

type OfficialCardNode = {
  type?: string
  header?: {
    title?: { text?: Text }
    image?: { image?: Thumbnail[] }
    metadata?: MetadataParts
    description?: { description?: Text }
    actions?: { actions_rows?: { actions?: CardAction[] }[] }
  }
  contents?: { items?: unknown[] }[]
}

const normalizeMixLockup = (input: unknown): SourceMix | undefined => {
  const playlist = normalizePlaylistLockup(input)
  const videoId = (input as LockupVideo).renderer_context?.command_context?.on_tap?.payload?.videoId
  return playlist && videoId ? { id: playlist.id, title: playlist.title, thumbnail: playlist.thumbnail, videoId } : undefined
}

// OfficialCardView and its HorizontalShelfView are this repo's patch of youtubei.js (patches/), which otherwise builds
// both at runtime off the first card it meets, logging each as missing. Signed out, the entity store still says
// "not subscribed", so the state is left absent there: an absent state is what makes the button sign in.
export const normalizeSearchCard = (input: unknown, mutations?: EntityMutation[]): SourceSearchCard | undefined => {
  const card = input as OfficialCardNode
  if (card.type !== 'OfficialCardView') return undefined
  const header = card.header
  const actions = header?.actions?.actions_rows?.flatMap((row) => row.actions ?? []) ?? []
  const subscribe = actions.find((action) => action.type === 'SubscribeButtonView')
  const id = subscribe?.channel_id ?? actions.map((action) => action.on_tap?.payload?.browseId).find(Boolean)
  const name = presentText(header?.title?.text)
  if (!id || !name) return undefined
  const parts = metadataTexts(header?.metadata)
  const handle = parts.find((part) => part.startsWith('@'))
  const [subscriberCountText, videoCountText] = parts.filter((part) => part !== handle)
  const items = card.contents?.flatMap((shelf) => shelf.items ?? []) ?? []
  return {
    channel: {
      id,
      name,
      avatar: thumbnail(header?.image?.image, AVATAR_WIDTH),
      handle,
      subscriberCountText,
      videoCountText,
      description: presentText(header?.description?.description),
      isSubscribed: subscribe?.is_signed_out === true ? undefined : storedSubscribed(mutations, subscribe?.state_entity_store_key),
      ...iconBadges(runIcons(header?.title?.text)),
    },
    mix: items.map(normalizeMixLockup).find((mix) => mix !== undefined),
    videos: items.flatMap((item) => normalizeLockupVideo(item) ?? []),
  }
}

// Only a Shelf of rows ("Latest from") and a GridShelfView of Shorts: a horizontal Shelf holds posts or related searches
export const normalizeSearchShelf = (input: unknown): SourceSearchShelf | undefined => {
  const node = input as {
    type?: string
    title?: Text
    content?: { type?: string, items?: unknown[], collapsed_item_count?: number }
    header?: { headline?: Text }
    contents?: unknown[]
  }
  if (node.type === 'GridShelfView') {
    const title = presentText(node.header?.headline)
    const shorts = (node.contents ?? []).flatMap((item) => normalizeShortsLockup(item) ?? [])
    return title && shorts.length > 0 ? { title, videos: [], shorts } : undefined
  }
  if (node.type !== 'Shelf' || node.content?.type !== 'VerticalList') return undefined
  const title = presentText(node.title)
  const videos = (node.content.items ?? []).flatMap((item) => normalizeFeedVideo(item) ?? normalizeLockupVideo(item) ?? [])
  return title && videos.length > 0
    ? { title, videos, collapsedCount: node.content.collapsed_item_count, shorts: [] }
    : undefined
}

// the playlist id is nowhere in `info` on any renderer, so the caller carries the id it browsed with
export const normalizePlaylistDetails = (input: unknown, id: string): SourcePlaylist => {
  const info = (input as PlaylistDetails).info
  return {
    id,
    title: presentText(info?.title) ?? id,
    description: presentText(info?.description),
    thumbnail: thumbnail(info?.thumbnails, STILL_WIDTH),
    videoCountText: presentText(info?.total_items),
    viewCountText: presentText(info?.views),
    updatedText: presentText(info?.last_updated),
    privacy: info?.privacy,
    isEditable: info?.is_editable,
    canDelete: info?.can_delete,
    canReorder: info?.can_reorder,
    channel: authorChannel(info?.author),
  }
}

// PlaylistVideo fuses view count and upload date into one line, bullet-separated under any hl
const videoInfoParts = (value: Text | undefined) =>
  presentText(value)?.split('•').map((part) => part.trim()).filter((part) => part.length > 0) ?? []

export const normalizePlaylistItem = (input: unknown): SourcePlaylistItem | undefined => {
  const node = input as PlaylistVideoNode
  if (node.style === 'PLAYLIST_VIDEO_RENDERER_STYLE_RECOMMENDED_VIDEO') return undefined
  const video = normalizeFeedVideo(node)
  if (!video) return undefined
  const parts = videoInfoParts(node.video_info)
  // 1-based, as YouTube numbers the rows.
  const index = Number(presentText(node.index))
  return {
    video: {
      ...video,
      viewCount: video.viewCount ?? parts[0],
      publishedText: video.publishedText ?? parts[1],
    },
    setVideoId: node.set_video_id,
    index: Number.isInteger(index) ? index : undefined,
  }
}

type PlaylistEdit = { playlistId?: string, actions?: { action?: string, setVideoId?: string }[] }

type PlaylistLockupRow = LockupVideo & {
  renderer_context?: { command_context?: { on_tap?: { payload?: { index?: number } } } }
  metadata?: {
    menu_button?: {
      on_tap?: {
        command?: {
          inline_content?: {
            content?: { items?: { renderer_context?: { command_context?: { on_tap?: { payload?: PlaylistEdit } } } }[] }
          }
        }
      }
    }
  }
}

// A lockup row has no set_video_id field, so the slot id is read off the row's own remove action for this playlist. Rows read signed out or from Liked videos carry none (measured 2026-11-01), and a row without one offers no Remove.
export const normalizePlaylistLockupItem = (input: unknown, playlistId: string): SourcePlaylistItem | undefined => {
  const video = normalizeLockupVideo(input)
  if (!video) return undefined
  const row = input as PlaylistLockupRow
  const index = row.renderer_context?.command_context?.on_tap?.payload?.index
  const setVideoId = row.metadata?.menu_button?.on_tap?.command?.inline_content?.content?.items
    ?.map((item) => item.renderer_context?.command_context?.on_tap?.payload)
    .filter((edit) => edit?.playlistId === playlistId)
    .flatMap((edit) => edit?.actions ?? [])
    .find((action) => action.action === 'ACTION_REMOVE_VIDEO' && action.setVideoId)?.setVideoId
  return {
    video,
    setVideoId,
    // the row's watch link counts from 0, where YouTube numbers the rows from 1
    index: typeof index === 'number' ? index + 1 : undefined,
  }
}

// the Text branch is taken ONLY on a real Text: stringifying an Author yields '[object Object]', which survives the 'N/A' filter
const bylineText = (author: Author | Text | undefined) => {
  const named = presentText((author as Author | undefined)?.name)
  if (named) return named
  const node = author as Text | undefined
  return typeof node?.text === 'string' ? presentText(node) : undefined
}

export const normalizePlaylistPanelVideo = (input: unknown): SourceVideo | undefined => {
  const node = input as PlaylistPanelVideoNode | undefined
  const row = node?.primary ?? node
  const id = row?.video_id
  const title = presentText(row?.title)
  if (!id || !title) return undefined
  return {
    id,
    title,
    thumbnail: thumbnail(row?.thumbnail, STILL_WIDTH),
    thumbnailSrcset: srcset(row?.thumbnail),
    durationSeconds: Number.isFinite(row?.duration?.seconds) ? row?.duration?.seconds : undefined,
    badges: [],
    // no channel: this node carries no channel id on any field, so one built here would link nowhere
  }
}

export const normalizeWatchPlaylist = (input: unknown): SourceWatchPlaylist | undefined => {
  const panel = input as WatchNextPlaylistPanel | undefined
  const id = panel?.id
  if (!id) return undefined
  return {
    id,
    title: presentText(panel?.title),
    author: bylineText(panel?.author),
    items: (panel?.contents ?? [])
      .map(normalizePlaylistPanelVideo)
      .filter((video) => video !== undefined),
    // 0-based, so 0 is a real position and must survive the guard
    currentIndex: Number.isInteger(panel?.current_index) ? panel?.current_index : undefined,
    isInfinite: panel?.is_infinite,
  }
}

type ChapterMarker = { value?: { chapters?: { title?: Text, time_range_start_millis?: number, thumbnail?: Thumbnail[] }[] } }

// on the player bar of /next's overlay, which youtubei.js parses outside contents_memo and hands back wrapped
const normalizeChapters = (input: unknown): SourceChapter[] => {
  const overlays = (input as { player_overlays?: { is_node?: boolean, item?: () => unknown } } | undefined)?.player_overlays
  const overlay = (overlays?.is_node ? overlays.item?.() : undefined) as {
    decorated_player_bar?: { player_bar?: { markers_map?: ChapterMarker[] } }
  } | null | undefined
  const markers = overlay?.decorated_player_bar?.player_bar?.markers_map ?? []
  const chapters = markers.find((marker) => (marker.value?.chapters?.length ?? 0) > 0)?.value?.chapters ?? []
  return chapters.flatMap((chapter) => {
    const title = presentText(chapter.title)
    const start = chapter.time_range_start_millis
    return title && typeof start === 'number' && Number.isFinite(start)
      ? [{ title, startSeconds: start / 1_000, thumbnail: thumbnail(chapter.thumbnail) }]
      : []
  })
}

/** The token that opens a finished stream's or premiere's chat replay, off /next's conversation bar. */
export const chatReplayToken = (input: unknown) => {
  const results = (input as WatchNextResponse | undefined)?.contents_memo?.get('TwoColumnWatchNextResults')?.[0] as {
    conversation_bar?: { is_replay?: boolean, continuation?: string } | null
  } | undefined
  const bar = results?.conversation_bar
  return bar?.is_replay === true && bar.continuation ? bar.continuation : undefined
}

// the sections of youtube.com's expanded description, in its order
const descriptionItems = (input: unknown): { type?: string }[] =>
  ((input as { engagement_panels?: { content?: { items?: { type?: string }[] } }[] }).engagement_panels ?? [])
    .flatMap((panel) => panel.content?.items ?? [])

type SongNode = {
  type?: string
  title?: string
  subtitle?: string
  secondary_subtitle?: { content?: string }
  // a ContentPreviewImageView in place of the list when upstream sends no sources
  image?: Thumbnail[] | { type?: string }
  on_tap?: { payload?: { videoId?: string } }
}

type CardListNode = {
  type?: string
  header?: { subtitle?: Text }
  cards?: SongNode[]
  footer_button?: { on_tap?: { payload?: { browseId?: string } } }
}

// the description lists its chapters in a card list too, of MacroMarkersListItem
const normalizeMusicSection = (input: unknown): SourceMusicSection | undefined => {
  const list = descriptionItems(input).find((item): item is CardListNode =>
    item.type === 'HorizontalCardList' && (item as CardListNode).cards?.some((card) => card.type === 'VideoAttributeView') === true)
  const songs = (list?.cards ?? []).flatMap((card) => {
    const title = card.type === 'VideoAttributeView' ? presentText(card.title) : undefined
    return title
      ? [{
          title,
          artist: presentText(card.subtitle) || undefined,
          album: presentText(card.secondary_subtitle?.content) || undefined,
          thumbnail: Array.isArray(card.image) ? thumbnail(card.image) : undefined,
          videoId: card.on_tap?.payload?.videoId,
        }]
      : []
  })
  if (!list || songs.length === 0) return undefined
  return { countText: presentText(list.header?.subtitle), songs, channelId: list.footer_button?.on_tap?.payload?.browseId }
}

type ChannelCardNode = {
  section_title?: Text
  section_subtitle?: Text
  channel_avatar?: Thumbnail[]
  channel_endpoint?: { payload?: { browseId?: string } }
  creator_videos_button?: { endpoint?: { metadata?: { url?: string } } }
  creator_about_button?: { endpoint?: { metadata?: { url?: string } } }
  creator_custom_url_buttons?: { title?: string, on_tap?: { payload?: { url?: string } } }[]
}

const normalizeChannelCard = (input: unknown): SourceChannelCard | undefined => {
  const card = descriptionItems(input).find((item) => item.type === 'VideoDescriptionInfocardsSection') as ChannelCardNode | undefined
  const id = card?.channel_endpoint?.payload?.browseId
  const name = presentText(card?.section_title)
  if (!card || !id || !name) return undefined
  return {
    id,
    name,
    avatar: thumbnail(card.channel_avatar, AVATAR_WIDTH),
    subscriberCountText: presentText(card.section_subtitle),
    videosUrl: card.creator_videos_button?.endpoint?.metadata?.url,
    aboutUrl: card.creator_about_button?.endpoint?.metadata?.url,
    links: (card.creator_custom_url_buttons ?? []).flatMap((button) => {
      const url = outboundUrl(button.on_tap?.payload?.url)
      return button.title && url ? [{ title: button.title, url }] : []
    }),
  }
}

type PanelCommand = {
  identifier?: { tag?: string }
  contentSourcePanelIdentifier?: { tag?: string }
  globalConfiguration?: { params?: string }
}

type TranscriptSectionNode = {
  type?: string
  primary_button?: {
    endpoint?: {
      payload?: PanelCommand & {
        commands?: { updateEngagementPanelContentCommand?: PanelCommand, showEngagementPanelEndpoint?: PanelCommand }[]
      }
    }
  }
}

/* The description's "Show transcript" opens youtube.com's own panel with a get_panel call, never the older
   engagement-panel-searchable-transcript /next still lists (measured 2026-11-10): a video with chapters names it in an
   updateEngagementPanelContentCommand, one without in a showEngagementPanelEndpoint. */
const normalizeTranscriptPanel = (input: unknown): SourceTranscriptPanel | undefined => {
  const section = descriptionItems(input).find((item) => item.type === 'VideoDescriptionTranscriptSection') as TranscriptSectionNode | undefined
  const payload = section?.primary_button?.endpoint?.payload
  const commands = [
    payload,
    ...(payload?.commands ?? []).map((command) => command.updateEngagementPanelContentCommand ?? command.showEngagementPanelEndpoint),
  ]
  for (const command of commands) {
    const panelId = command?.contentSourcePanelIdentifier?.tag ?? command?.identifier?.tag
    const params = command?.globalConfiguration?.params
    if (panelId && params) return { panelId, params }
  }
  return undefined
}

type TranscriptItem = {
  macroMarkersPanelItemViewModel?: {
    item?: {
      timelineItemViewModel?: { timestamp?: string, contentItems?: { transcriptSegmentViewModel?: { simpleText?: string } }[] }
      timelineChapterViewModel?: { title?: string }
    }
    onTap?: { innertubeCommand?: { watchEndpoint?: { startTimeSeconds?: number } } }
  }
}

type TranscriptItemSection = { itemSectionRenderer?: { header?: TranscriptItem, contents?: TranscriptItem[] } }

type TranscriptAnswer = {
  content?: {
    engagementPanelSectionListRenderer?: {
      content?: {
        sectionListRenderer?: {
          contents?: TranscriptItemSection[]
          header?: { searchInputViewModel?: { onInputAction?: { command?: { innertubeCommand?: { continuationCommand?: { token?: string } } } } } }
        }
      }
    }
  }
  onResponseReceivedCommand?: { reloadContinuationItemsCommand?: { continuationItems?: TranscriptItemSection[] } }
}

const transcriptLines = (items: readonly TranscriptItem[]): SourceTranscriptLine[] => items.flatMap((item) => {
  const line = item.macroMarkersPanelItemViewModel?.item?.timelineItemViewModel
  const timestamp = line?.timestamp
  const text = line?.contentItems?.map((content) => content.transcriptSegmentViewModel?.simpleText ?? '').join(' ').trim()
  const startSeconds = timestamp?.split(':').reduce((total, part) => total * 60 + Number(part), 0)
  return timestamp && text && Number.isFinite(startSeconds) ? [{ startSeconds: startSeconds!, timestamp, text }] : []
})

/** A transcript from get_panel's answer: the panel's first answer, or a search's, which reloads the lines alone. */
export const normalizeTranscript = (input: unknown): SourceTranscript => {
  const answer = input as TranscriptAnswer | undefined
  const list = answer?.content?.engagementPanelSectionListRenderer?.content?.sectionListRenderer
  const sections = list?.contents ?? answer?.onResponseReceivedCommand?.reloadContinuationItemsCommand?.continuationItems ?? []
  return {
    sections: sections.flatMap(({ itemSectionRenderer: section }) => {
      const lines = transcriptLines(section?.contents ?? [])
      const header = section?.header?.macroMarkersPanelItemViewModel
      const title = header?.item?.timelineChapterViewModel?.title || undefined
      const startSeconds = title ? header?.onTap?.innertubeCommand?.watchEndpoint?.startTimeSeconds : undefined
      return lines.length > 0 ? [{ title, startSeconds, lines }] : []
    }),
    searchToken: list?.header?.searchInputViewModel?.onInputAction?.command?.innertubeCommand?.continuationCommand?.token,
  }
}

export const normalizeWatchMeta = (input: unknown, id: string): SourceWatchMeta | undefined => {
  const memo = (input as WatchNextResponse | undefined)?.contents_memo
  if (!memo) return undefined
  const first = (type: string) => memo.get(type)?.[0]
  const primary = first('VideoPrimaryInfo') as {
    title?: Text
    super_title_link?: Text
    badges?: { style?: string }[]
    view_count?: {
      view_count?: Text
      short_view_count?: Text
      extra_short_view_count?: Text
      is_live?: boolean
      original_view_count?: number
    }
    published?: Text
    relative_date?: Text
  } | undefined
  const secondary = first('VideoSecondaryInfo') as {
    owner?: { subscriber_count?: Text, author?: Author }
    description?: Text
  } | undefined
  const likeView = first('SegmentedLikeDislikeButtonView') as {
    like_count?: number
    short_like_count?: string
  } | undefined
  const likeLegacy = first('SegmentedLikeDislikeButton') as {
    like_button?: { like_count?: number, short_like_count?: string, is_toggled?: boolean }
    dislike_button?: { is_toggled?: boolean }
  } | undefined
  const likeButtonView = first('LikeButtonView') as {
    like_status_entity?: { like_status?: string }
    like_status?: string
  } | undefined
  const subscribeButton = first('SubscribeButton') as {
    subscribed?: boolean
    notification_preference_button?: {
      current_state_id?: string | number
      states?: { state_id?: string | number, id?: string | number }[]
    }
  } | undefined
  const commentsHeader = first('CommentsEntryPointHeader') as {
    comment_count?: Text
  } | undefined
  // a short, and a signed-out video, carry the count only on the comments panel's header
  const commentsPanel = (input as { engagement_panels?: { panel_identifier?: string, header?: { contextual_info?: Text } }[] })
    .engagement_panels?.find((panel) => panel.panel_identifier === 'engagement-panel-comments-section')
  // the container, not memo.get('PlaylistPanelVideo'): the id, title, byline and current index exist nowhere else
  const watchNext = first('TwoColumnWatchNextResults') as {
    playlist?: unknown
    autoplay?: { sets?: { autoplay_video?: { payload?: { videoId?: string } } }[] }
  } | undefined
  const owner = secondary?.owner
  const author = owner?.author
  const collaboration = authorByline(author)
  const likeCount = likeView?.short_like_count
    ?? likeLegacy?.like_button?.short_like_count
    ?? [likeView?.like_count ?? likeLegacy?.like_button?.like_count]
      .filter((count): count is number => Number.isFinite(count))
      .map(String)[0]
  const related = [
    ...(memo.get('CompactVideo') ?? []).map(normalizeFeedVideo),
    ...(memo.get('LockupView') ?? []).map((node) => normalizeLockupVideo(node)),
  ].filter((video) => video !== undefined)
  const status = likeStatus(likeButtonView?.like_status_entity?.like_status ?? likeButtonView?.like_status)
    ?? (likeLegacy?.like_button?.is_toggled === true
      ? 'LIKE'
      : likeLegacy?.dislike_button?.is_toggled === true ? 'DISLIKE' : undefined)
  const bell = subscribeButton?.notification_preference_button
  const views = primary?.view_count
  // upstream now sends only the bare '1.8B' for a video, and youtube.com adds the word itself
  const extraShort = presentText(views?.extra_short_view_count)
  // a section that holds "Comments are turned off" is named comment-item-section, one that loads comments comments-section
  const commentSections = (memo.get('ItemSection') ?? []) as { target_id?: string }[]
  const hasComments = commentSections.some((section) => section.target_id === 'comments-section' || section.target_id === 'comment-item-section')
  const promo = primary ? undefined : first('BackgroundPromo') as { title?: Text } | undefined
  return {
    id,
    unavailableText: presentText(promo?.title),
    title: text(primary?.title),
    isLive: primary?.view_count?.is_live === true,
    isMembersOnly: hasBadgeStyle(primary?.badges, 'MEMBERS_ONLY') ? true : undefined,
    commentsHidden: hasComments ? undefined : true,
    hasChatReplay: chatReplayToken(input) !== undefined,
    concurrentViewers: primary?.view_count?.original_view_count,
    viewCountText: presentText(views?.view_count) ?? presentText(views?.short_view_count),
    publishedDateText: text(primary?.published) ?? text(primary?.relative_date),
    shortViewCountText: views?.is_live
      ? undefined
      : presentText(views?.short_view_count) ?? (extraShort ? `${extraShort} views` : undefined),
    relativeDateText: presentText(primary?.relative_date),
    hashtags: normalizeRuns(primary?.super_title_link)
      .map(run => run.text.trim())
      .filter(tag => tag.startsWith('#')),
    likeCountText: likeCount,
    commentCountText: text(commentsHeader?.comment_count) ?? text(commentsPanel?.header?.contextual_info),
    description: presentText(secondary?.description),
    descriptionRuns: normalizeRuns(secondary?.description),
    likeStatus: status,
    channel: collaboration.byline ? collaboration.channel : author?.id && author.name
      ? {
          id: author.id,
          name: author.name,
          avatar: thumbnail(author.thumbnails, AVATAR_WIDTH),
          handle: handleFromUrl(author.url),
          subscriberCountText: text(owner?.subscriber_count),
          ...authorBadges(author),
          isSubscribed: subscribeButton?.subscribed,
          notificationLevel: notificationLevel(
            bell?.current_state_id ?? bell?.states?.find((state) => state.id === bell.current_state_id)?.state_id,
          ),
        }
      : undefined,
    byline: collaboration.byline,
    collaborators: collaboration.collaborators,
    related,
    autoplayId: watchNext?.autoplay?.sets?.[0]?.autoplay_video?.payload?.videoId || undefined,
    playlist: normalizeWatchPlaylist(watchNext?.playlist),
    chapters: normalizeChapters(input),
    transcriptPanel: normalizeTranscriptPanel(input),
    music: normalizeMusicSection(input),
    channelCard: normalizeChannelCard(input),
  }
}

/** The channels of the signed-in Google account, from the AccountItem nodes of WEB's accounts_list. */
export const normalizeSession = (input: unknown): SourceSession => {
  const rows = Array.isArray(input) ? input as AccountItemNode[] : []
  const account = rows.find((row) => row.is_selected === true) ?? rows[0]
  return {
    signedIn: true,
    name: presentText(account?.account_name),
    avatar: thumbnail(account?.account_photo, AVATAR_WIDTH),
    handle: presentText(account?.channel_handle),
    accounts: rows.map((row) => ({
      brandPageId: row.endpoint?.payload?.supportedTokens?.find((token) => token.pageIdToken?.pageId)?.pageIdToken?.pageId,
      name: presentText(row.account_name),
      avatar: thumbnail(row.account_photo, AVATAR_WIDTH),
      handle: presentText(row.channel_handle),
      selected: row.is_selected === true ? true : undefined,
      hasChannel: row.has_channel === true ? true : undefined,
    })),
  }
}

export const normalizeCommentView = (input: unknown): SourceComment | undefined => {
  const comment = input as CommentViewNode | undefined
  if (!comment?.comment_id) return undefined
  return {
    id: comment.comment_id,
    author: comment.author?.id && comment.author.name
      ? {
          id: comment.author.id,
          name: comment.author.name,
          avatar: thumbnail(comment.author.thumbnails, AVATAR_WIDTH),
          handle: handleFromUrl(comment.author.url) ?? (comment.author.name.startsWith('@') ? comment.author.name : undefined),
          ...authorBadges(comment.author),
        }
      : undefined,
    text: text(comment.content) ?? '',
    runs: normalizeRuns(comment.content),
    publishedText: comment.published_time,
    likeCountText: comment.like_count,
    replyCount: approximateCount(comment.reply_count),
    isPinned: comment.is_pinned === true ? true : undefined,
    isHearted: comment.is_hearted === true ? true : undefined,
    isLiked: comment.is_liked === true ? true : undefined,
    isDisliked: comment.is_disliked === true ? true : undefined,
    isCreator: comment.author_is_channel_owner === true ? true : undefined,
    isMember: comment.is_member === true ? true : undefined,
  }
}

export const normalizeCommentThread = (input: unknown): SourceComment | undefined =>
  normalizeCommentView((input as CommentThread | undefined)?.comment)

type LiveChatItemNode = {
  type?: string
  id?: string
  message?: Text
  header_subtext?: Text
  author?: Author & {
    badges?: { icon_type?: string, tooltip?: string, custom_thumbnail?: Thumbnail[] }[]
    is_moderator?: boolean
  }
  timestamp_text?: string
  purchase_amount?: string
  header_background_color?: number
  body_background_color?: number
}

// upstream sends colours as signed 32-bit ARGB integers; the alpha byte is dropped rather than converted
const argbColor = (value: number | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return `#${(value >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`
}

// an emoji run's text is a `:shortcut:` that renders as literal punctuation, so the image is the content
const normalizeLiveChatRuns = (value: Text | undefined): SourceLiveChatRun[] => {
  const runs = (value as { runs?: (RunNode & { emoji?: { image?: Thumbnail[], shortcuts?: string[], is_custom?: boolean } })[] } | undefined)?.runs
  if (!runs?.length) return normalizeRuns(value)
  return runs.flatMap((run) => {
    const emoji = run.emoji
    if (emoji) {
      const url = thumbnail(emoji.image, EMOJI_WIDTH)
      if (!url) return run.text ? [{ text: run.text }] : []
      return [{ text: run.text ?? '', emojiUrl: url, emojiLabel: emoji.shortcuts?.[0] ?? run.text ?? '' }]
    }
    return run.text ? normalizeRuns({ runs: [run] } as Text) : []
  })
}

// chat emoji render at 24px, so 48 covers them at 2x
const EMOJI_WIDTH = 48

const AUTHOR_OWNER_BADGES = new Set(['OWNER'])
const AUTHOR_MODERATOR_BADGES = new Set(['MODERATOR'])

export const normalizeLiveChatMessage = (input: unknown): SourceLiveChatMessage | undefined => {
  const item = input as LiveChatItemNode | undefined
  if (!item?.id) return undefined
  const badges = item.author?.badges ?? []
  const iconTypes = badges.flatMap((badge) => (badge.icon_type ? [badge.icon_type] : []))
  // a member badge is the channel's own emoji, so there is no icon_type to match on
  const isMember = badges.some((badge) => (badge.custom_thumbnail?.length ?? 0) > 0)
  const body = item.message ?? item.header_subtext
  return {
    id: item.id,
    author: item.author?.id && item.author.name
      ? {
          id: item.author.id,
          name: item.author.name,
          avatar: thumbnail(item.author.thumbnails, AVATAR_WIDTH),
          handle: handleFromUrl(item.author.url),
          isVerified: item.author.is_verified === true ? true : undefined,
        }
      : undefined,
    text: text(body) ?? '',
    runs: normalizeLiveChatRuns(body),
    timestampText: item.timestamp_text,
    isOwner: iconTypes.some((icon) => AUTHOR_OWNER_BADGES.has(icon)) ? true : undefined,
    isModerator: item.author?.is_moderator === true || iconTypes.some((icon) => AUTHOR_MODERATOR_BADGES.has(icon))
      ? true
      : undefined,
    isMember: isMember ? true : undefined,
    purchaseAmountText: item.purchase_amount,
    headerBackgroundColor: argbColor(item.header_background_color),
    bodyBackgroundColor: argbColor(item.body_background_color),
  }
}

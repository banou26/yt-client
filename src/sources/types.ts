export type SourceLikeStatus = 'LIKE' | 'DISLIKE' | 'INDIFFERENT'

export type SourceNotificationLevel = 'ALL' | 'PERSONALIZED' | 'NONE'

// `SourcePlaylist.privacy` stays a plain string because it echoes whatever the playlist header carries
export type SourcePlaylistPrivacy = 'PUBLIC' | 'UNLISTED' | 'PRIVATE'

export type SourceChannel = {
  id: string
  name: string
  avatar?: string
  handle?: string
  subscriberCountText?: string
  videoCountText?: string
  banner?: string
  description?: string
  isSubscribed?: boolean
  notificationLevel?: SourceNotificationLevel
  isVerified?: boolean
  // the music-note badge an official artist channel carries in place of the check
  isVerifiedArtist?: boolean
}

export type SourceVideo = {
  id: string
  title: string
  description?: string
  descriptionSnippet?: string
  // a search row's excerpt, with the query's words as bold runs
  snippetRuns?: SourceTextRun[]
  thumbnail?: string
  thumbnailSrcset?: string
  animatedThumbnail?: string
  // the label youtube.com draws in the still's top corner, such as New
  thumbnailBadge?: string
  durationSeconds?: number
  // youtube.com draws a music note before a song's length
  isMusic?: boolean
  viewCount?: string
  // youtube.com draws a play arrow before this row's view count
  viewCountIcon?: boolean
  publishedText?: string
  // what youtube.com draws between this row's view count and date, sent with a lockup (a space today); a bullet otherwise
  metaDelimiter?: string
  // ISO 8601, only on a channel's uploads: exact off its feed, about right off its Videos tab's '6d ago'
  publishedAt?: string
  isLive?: boolean
  progressPercent?: number
  isUpcoming?: boolean
  isMembersOnly?: boolean
  isShort?: boolean
  badges: string[]
  // a collaboration's first channel, when the answer lists them
  channel?: SourceChannel
  /** Only a search row carries them, with upstream's heading for the list ('3 chapters in this video'). */
  chapters?: SourceChapter[]
  chaptersTitle?: string
  /**
   * Set only on a video two or more channels made (a collaboration): its byline as youtube.com prints it, one part per
   * name ('Cleo Abram', 'and Marques Brownlee', or 'and 2 more').
   */
  byline?: SourceBylinePart[]
  // a collaboration's channels, as the choice youtube.com opens from its avatars lists them; a channel's Videos tab has none
  collaborators?: SourceChannel[]
}

export type SourceBylinePart = {
  text: string
  isVerified?: boolean
  isVerifiedArtist?: boolean
}

export type SourceVideoPage = {
  items: SourceVideo[]
  // Required rather than optional so the compiler names every page builder
  playlists: SourcePlaylist[]
  cursor?: string
}

export type SourceVideoSection = {
  title?: string
  items: SourceVideo[]
}

// Deliberately NOT a SourceVideo: a SourceVideo would need a fabricated title for every slide after the first
export type SourceShort = {
  id: string
  poster?: string
  title?: string
}

export type SourceShortsPage = {
  items: SourceShort[]
  cursor?: string
}

export type SourceSectionedVideoPage = {
  sections: SourceVideoSection[]
  cursor?: string
}

export type SourceFeedChip = {
  id: string
  label: string
  selected: boolean
}

export type SourceHomePage = {
  items: SourceVideo[]
  shorts: SourceVideo[]
  cursor?: string
}

export type SourceHomeFeed = SourceHomePage & {
  chips: SourceFeedChip[]
}

export type SourceSearchUploadDate = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR'

export type SourceSearchType = 'ALL' | 'VIDEO' | 'SHORTS' | 'CHANNEL' | 'PLAYLIST' | 'MOVIE'

export type SourceSearchDuration = 'ALL' | 'UNDER_THREE_MINS' | 'THREE_TO_TWENTY_MINS' | 'OVER_TWENTY_MINS'

export type SourceSearchSort = 'RELEVANCE' | 'POPULARITY'

export type SourceSearchFeature =
  | 'HD' | 'SUBTITLES' | 'CREATIVE_COMMONS' | 'THREE_D' | 'LIVE'
  | 'PURCHASED' | 'FOUR_K' | 'THREE_SIXTY' | 'LOCATION' | 'HDR' | 'VR180'

export type SourceSearchFilters = {
  uploadDate?: SourceSearchUploadDate
  type?: SourceSearchType
  duration?: SourceSearchDuration
  sortBy?: SourceSearchSort
  features?: SourceSearchFeature[]
  // youtube.com's Unwatched chip
  unwatched?: boolean
}

// A mix has no playlist page: it plays at /watch on `videoId` inside its list
export type SourceMix = {
  id: string
  title: string
  thumbnail?: string
  videoId: string
}

// The card youtube.com puts above the results of an artist or channel search
export type SourceSearchCard = {
  channel: SourceChannel
  mix?: SourceMix
  videos: SourceVideo[]
}

// "Latest from" a channel as result rows, a row of video cards ("People also search for"), or a row of Shorts
export type SourceSearchShelf = {
  title: string
  // the line under a row of cards' title: 'People also search for'
  subtitle?: string
  videos: SourceVideo[]
  // `videos` scroll sideways as cards rather than stacking as result rows
  horizontal?: boolean
  // how many of `videos` upstream shows before the rest fold behind a button
  collapsedCount?: number
  shorts: SourceVideo[]
}

export type SourceTopicVideo = {
  id: string
  title: string
  thumbnail?: string
  durationSeconds?: number
  // as upstream prints it: 'Minecraft • 172K • 11h ago' under the newest video, '301K • 3d ago' in the list
  subtitle?: string
  channel?: SourceChannel
  // ISO 8601, on a video not yet out, whose date upstream leaves for the page to print
  scheduledAt?: string
}

// The card youtube.com puts in the right column of a broad search, a game for one: the topic, its newest video and more
export type SourceSearchTopic = {
  title: string
  // 'Video game • Released: 2009'
  subtitle?: string
  // the topic's own channel, which the title and View all open
  channelId: string
  hero?: SourceTopicVideo
  videos: SourceTopicVideo[]
}

// The tag sits ALONGSIDE the entity's own fields rather than wrapping them, and `kind` is not in the schema
export type SourceSearchResult =
  | (SourceVideo & { kind: 'video' })
  | (SourceChannel & { kind: 'channel' })
  | (SourcePlaylist & { kind: 'playlist' })
  | (SourceSearchCard & { kind: 'card' })
  | (SourceSearchShelf & { kind: 'shelf' })

export type SourceSearchPage = {
  results: SourceSearchResult[]
  // only on a search's first page
  topic?: SourceSearchTopic
  refinements: string[]
  estimatedResults?: number
  cursor?: string
  // whether upstream offers its Unwatched chip for this search
  unwatchedChip: boolean
}

/**
 * One suggestion for the search box, `query` being what it searches for. `name` is set when upstream ties it to a
 * person, a thing or a channel (then `channelId`), with what that is in `description` and its `photo`.
 */
export type SourceSearchSuggestion = {
  query: string
  name?: string
  description?: string
  photo?: string
  channelId?: string
}

export type SourceChannelTab =
  | 'HOME' | 'VIDEOS' | 'SHORTS' | 'LIVE' | 'RELEASES'
  | 'PODCASTS' | 'COURSES' | 'SHOWS' | 'PLAYLISTS' | 'COMMUNITY' | 'STORE' | 'ABOUT' | 'SEARCH'

export type SourceNotification = {
  id: string
  message: string
  sentText?: string
  avatar?: string
  thumbnail?: string
  videoId?: string
  read?: boolean
}

export type SourceNotificationPage = {
  items: SourceNotification[]
  cursor?: string
}

export type SourceChannelLink = {
  title: string
  // where the link goes, never upstream's redirect page
  url: string
  displayUrl?: string
}

export type SourceChannelAbout = {
  description?: string
  country?: string
  joinedDateText?: string
  viewCountText?: string
  subscriberCountText?: string
  videoCountText?: string
  canonicalUrl?: string
  links: SourceChannelLink[]
}

export type SourcePost = {
  id: string
  author?: SourceChannel
  text: string
  publishedText?: string
  voteCountText?: string
  // as the Posts tab shows it ("1K"); absent where youtube.com shows none, as on the post's own page
  commentCountText?: string
  // upstream's spoken form of the count ("1K comments")
  commentCountLabel?: string
  attachedVideo?: SourceVideo
  attachedImage?: string
}

export type SourcePostPage = {
  items: SourcePost[]
  cursor?: string
}

// a game's own channel, which youtube.com pictures by the game's box art
export type SourceGame = {
  id: string
  title: string
  boxArt?: string
}

// One kind of item per row upstream, but nothing stops a row mixing them, so each list is kept rather than a tagged union
export type SourceChannelShelf = {
  title: string
  subtitle?: string
  // upstream's own path, which the app's routes take as they are
  url?: string
  // a row of full-size cards that opens to all of them, as youtube.com draws a topic channel's rows; otherwise it scrolls
  expandable?: boolean
  // the channel's own uploads, whose rows youtube.com prints without the channel's name
  uploads?: boolean
  videos: SourceVideo[]
  shorts: SourceVideo[]
  playlists: SourcePlaylist[]
  channels: SourceChannel[]
  games: SourceGame[]
  posts: SourcePost[]
}

export type SourceChannelHome = {
  featured?: SourceVideo
  shelves: SourceChannelShelf[]
  // upstream's own line for a Home it does not serve in this region ("This page is not available.")
  message?: string
}

export type SourceChannelPage = {
  channel: SourceChannel
  videos: SourceVideoPage
  availableTabs: SourceChannelTab[]
  tab: SourceChannelTab
  sortOptions: string[]
  appliedSort?: string
  // the sorts sit in one dropdown chip, as on the Live tab, and `filterOptions` are the chips after it
  sortMenu: boolean
  filterOptions: string[]
  appliedFilter?: string
  // only on the Home tab
  home?: SourceChannelHome
  // only on the Store tab
  store?: SourceStoreShelf[]
}

export type SourceProduct = {
  title: string
  // the product's page on its store, never upstream's redirect page
  url: string
  thumbnail?: string
  // "Unavailable" in place of the price when upstream prints that
  price?: string
  priceNote?: string
  merchant?: string
}

export type SourceStoreShelf = {
  title: string
  scrolls?: boolean
  products: SourceProduct[]
}

/**
 * Leads the message `channel` rejects with when upstream answers with its own line in place of the channel, such as
 * "This channel does not exist.", which follows it word for word. Only an error's message crosses the realms.
 */
export const CHANNEL_UNAVAILABLE = 'youtube: channel unavailable: '

/** The message `channel` rejects with when a handle names no channel, where youtube.com answers with its 404 page. */
export const CHANNEL_NOT_FOUND = 'youtube: no channel has this handle'

export type SourceWatchPlaylist = {
  id: string
  title?: string
  author?: string
  items: SourceVideo[]
  currentIndex?: number
  isInfinite?: boolean
}

export type SourceWatchMeta = {
  id: string
  /** Upstream's own line for a video that no longer exists, which youtube.com shows in place of the whole page. */
  unavailableText?: string
  isLive?: boolean
  isMembersOnly?: boolean
  /** True when youtube.com's watch page has no comments section at all, as on a members-only or private video. */
  commentsHidden?: boolean
  /** A finished stream or premiere whose chat can be replayed with `liveChatReplay`. */
  hasChatReplay?: boolean
  concurrentViewers?: number
  title?: string
  viewCountText?: string
  publishedDateText?: string
  shortViewCountText?: string
  relativeDateText?: string
  hashtags: string[]
  likeCountText?: string
  commentCountText?: string
  description?: string
  descriptionRuns: SourceTextRun[]
  likeStatus?: SourceLikeStatus
  // a collaboration's first channel
  channel?: SourceChannel
  /** Set only on a video two or more channels made, as on SourceVideo; its channels carry their subscribe state. */
  byline?: SourceBylinePart[]
  collaborators?: SourceChannel[]
  related: SourceVideo[]
  relatedCursor?: string
  /** The video youtube.com's own autoplay moves on to, often not the first related one. */
  autoplayId?: string
  playlist?: SourceWatchPlaylist
  /** In playback order, and empty when the video has none. */
  chapters: SourceChapter[]
  /** What youtube.com's description section "Transcript" opens, absent for a video without one. */
  transcriptPanel?: SourceTranscriptPanel
  /** youtube.com's description section "Music", absent for a video without one. */
  music?: SourceMusicSection
  /** The card for the video's channel that ends youtube.com's expanded description. */
  channelCard?: SourceChannelCard
}

export type SourceSong = {
  title: string
  artist?: string
  album?: string
  thumbnail?: string
  /** The song's own video, which its card opens; absent when the card opens nothing. */
  videoId?: string
}

export type SourceMusicSection = {
  /** As the section heads its songs, "1 song". */
  countText?: string
  songs: SourceSong[]
  /** The channel its Music button opens. */
  channelId?: string
}

export type SourceChannelCard = {
  id: string
  name: string
  avatar?: string
  subscriberCountText?: string
  /** youtube.com's addresses of the card's Videos and About buttons, such as /channel/UC.../videos. */
  videosUrl?: string
  aboutUrl?: string
  /** The channel's own links, such as its Instagram. */
  links: SourceChannelLink[]
}

/** The get_panel arguments of a video's transcript, as youtube.com's description button sends them. */
export type SourceTranscriptPanel = {
  panelId: string
  params: string
}

export type SourceTranscriptLine = {
  startSeconds: number
  /** As youtube.com prints it, "1:02". */
  timestamp: string
  text: string
}

/** One per chapter, titled "Chapter 1: ...", or a single untitled one for a video without chapters. */
export type SourceTranscriptSection = {
  title?: string
  /** The chapter's start, which its heading seeks to; absent with the title. */
  startSeconds?: number
  lines: SourceTranscriptLine[]
}

export type SourceTranscript = {
  sections: SourceTranscriptSection[]
  /** What `transcriptSearch` takes with a query; absent on a search's own answer. */
  searchToken?: string
}

export type SourceChapter = {
  title: string
  startSeconds: number
  thumbnail?: string
}

export type SourceTextRun = {
  text: string
  bold?: boolean
  url?: string
  videoId?: string
  startSeconds?: number
  browseId?: string
}

export type SourceLiveChatMessage = {
  id: string
  author?: SourceChannel
  text: string
  runs: SourceLiveChatRun[]
  timestampText?: string
  isOwner?: boolean
  isModerator?: boolean
  isMember?: boolean
  purchaseAmountText?: string
  headerBackgroundColor?: string
  bodyBackgroundColor?: string
  /** On a replay only: the point of the video the line was said at, in milliseconds. */
  offsetMs?: number
}

/** youtube.com's two replays: TOP leaves out what upstream filters as likely spam, ALL keeps everything. */
export type SourceChatReplayView = 'TOP' | 'ALL'

export type SourceLiveChatRun = SourceTextRun & {
  emojiUrl?: string
  emojiLabel?: string
}

export type SourceLiveChatPage = {
  items: SourceLiveChatMessage[]
  cursor?: string
  // The client holds the transcript, so a removal has to travel as its own instruction
  removedIds?: string[]
  disabled?: boolean
}

export type SourceComment = {
  id: string
  author?: SourceChannel
  text: string
  runs: SourceTextRun[]
  publishedText?: string
  likeCountText?: string
  replyCount?: number
  isPinned?: boolean
  isHearted?: boolean
  isLiked?: boolean
  isDisliked?: boolean
  isCreator?: boolean
  isMember?: boolean
  repliesCursor?: string
  // Opaque handle for this comment's like, dislike and reply endpoints, which cannot be rebuilt from the id
  actionsToken?: string
}

export type SourceCommentSort = 'TOP' | 'NEWEST'

export type SourceCommentPage = {
  items: SourceComment[]
  cursor?: string
  disabled?: boolean
  countText?: string
}

export type SourcePlaylist = {
  id: string
  title: string
  description?: string
  thumbnail?: string
  videoCountText?: string
  viewCountText?: string
  updatedText?: string
  privacy?: string
  isEditable?: boolean
  canDelete?: boolean
  canReorder?: boolean
  channel?: SourceChannel
}

// A playlist entry WRAPS its video instead of extending it: `setVideoId` identifies the slot, and the same video can sit in a playlist twice
export type SourcePlaylistItem = {
  video: SourceVideo
  setVideoId?: string
  // 1-BASED, unlike SourceWatchPlaylist.currentIndex and watch()'s playlistIndex
  index?: number
}

export type SourcePlaylistPage = {
  playlist: SourcePlaylist
  items: SourcePlaylistItem[]
  cursor?: string
}

export type SourcePlaylistListPage = {
  items: SourcePlaylist[]
  cursor?: string
}

/** One channel of the signed-in Google account. `brandPageId` is a brand channel's page ID, absent on the account's own. */
export type SourceAccount = {
  brandPageId?: string
  name?: string
  avatar?: string
  handle?: string
  selected?: boolean
  hasChannel?: boolean
}

export type SourceSession = {
  signedIn: boolean
  name?: string
  avatar?: string
  handle?: string
  accounts: SourceAccount[]
}

export type Source = {
  id: string
  home(chip?: string, cursor?: string): Promise<SourceHomeFeed>
  // There is no Shorts DESTINATION feed to fall back on: `FEshorts` parses to an empty response
  shorts(seed?: string, cursor?: string): Promise<SourceShortsPage>
  subscriptions(cursor?: string): Promise<SourceVideoPage>
  history(cursor?: string): Promise<SourceSectionedVideoPage>
  // `all` follows the list past its first page, at a cost of one request per page
  subscribedChannels(all?: boolean): Promise<SourceChannel[]>
  // A channel's newest long uploads, read off its public feed, or its Videos tab when the feed fails; a channel id that is not of the `UC` form is refused
  channelUploads(channelId: string): Promise<SourceVideo[]>
  search(query: string, filters?: SourceSearchFilters, cursor?: string): Promise<SourceSearchPage>
  // Not an InnerTube call: every keystroke that reaches it is a tunneled round trip, so the caller is expected to debounce
  searchSuggestions(query: string, previousQuery?: string): Promise<SourceSearchSuggestion[]>
  video(id: string): Promise<SourceVideo | undefined>
  // `id` is a UC id or a youtube.com channel path without its leading slash: `@handle`, `c/<name>` or `user/<name>`
  channel(id: string, tab?: SourceChannelTab, sort?: string, query?: string, cursor?: string, filter?: string): Promise<SourceChannelPage>
  channelAbout(id: string): Promise<SourceChannelAbout | undefined>
  communityPosts(channelId: string, cursor?: string): Promise<SourcePostPage>
  // undefined when youtube.com has no post under that id
  post(id: string): Promise<SourcePost | undefined>
  // `playlistIndex` is 0-based; the server corrects an out-of-range one, so the honoured position is the one on the result
  watch(id: string, playlistId?: string, playlistIndex?: number): Promise<SourceWatchMeta | undefined>
  transcript(panelId: string, params: string): Promise<SourceTranscript>
  // the lines whose text matches `query`, by youtube.com's own search; `token` comes from the transcript's answer
  transcriptSearch(token: string, query: string): Promise<SourceTranscript>
  comments(videoId: string, sort?: SourceCommentSort, cursor?: string): Promise<SourceCommentPage>
  // `channelId` is the post's author: upstream keys a post's comments by both
  postComments(postId: string, channelId: string, sort?: SourceCommentSort, cursor?: string): Promise<SourceCommentPage>
  commentReplies(cursor: string): Promise<SourceCommentPage>
  // Polled rather than streamed: the emitter is kept running and each call drains what it buffered since the previous cursor
  liveChat(videoId: string, cursor?: string): Promise<SourceLiveChatPage>
  /**
   * A finished stream's or premiere's chat, as pages of lines placed by `offsetMs`. Without a cursor it starts at
   * `offsetMs`, with some lines from before that point; a cursor continues past the previous page and ignores
   * `offsetMs`. A page with no cursor is the end of the replay, and `disabled` means the video has none.
   */
  liveChatReplay(videoId: string, offsetMs: number, view?: SourceChatReplayView, cursor?: string): Promise<SourceLiveChatPage>
  relatedVideos(cursor: string): Promise<SourceVideoPage>
  playlists(cursor?: string): Promise<SourcePlaylistListPage>
  playlist(id: string, cursor?: string): Promise<SourcePlaylistPage>
  notifications(cursor?: string): Promise<SourceNotificationPage>
  unseenNotificationCount(): Promise<number>
  session(): Promise<SourceSession>
  // Writes resolve to the affected entity: only identity and the changed fields are meaningful, the rest is placeholders
  rateVideo(id: string, status: SourceLikeStatus): Promise<SourceWatchMeta>
  removeFromHistory(videoId: string): Promise<string>
  markNotificationRead(id: string): Promise<string>
  postComment(videoId: string, text: string): Promise<boolean>
  sendLiveChatMessage(videoId: string, text: string): Promise<boolean>
  replyToComment(actionsToken: string, text: string): Promise<boolean>
  rateComment(actionsToken: string, status: SourceLikeStatus): Promise<SourceComment>
  setSubscribed(channelId: string, subscribed: boolean): Promise<SourceChannel>
  setNotificationLevel(channelId: string, level: SourceNotificationLevel): Promise<SourceChannel>
  addToPlaylist(playlistId: string, videoIds: string[]): Promise<SourcePlaylist>
  removeFromPlaylist(playlistId: string, setVideoIds: string[]): Promise<SourcePlaylist>
  createPlaylist(title: string, videoIds?: string[], privacy?: SourcePlaylistPrivacy, description?: string): Promise<SourcePlaylist>
  deletePlaylist(id: string): Promise<string>
  renamePlaylist(id: string, title: string): Promise<SourcePlaylist>
  setPlaylistDescription(id: string, description: string): Promise<SourcePlaylist>
  setPlaylistPrivacy(id: string, privacy: SourcePlaylistPrivacy): Promise<SourcePlaylist>
  movePlaylistItem(playlistId: string, setVideoId: string, afterSetVideoId?: string): Promise<SourcePlaylist>
}

export type SourceApi = Omit<Source, 'id'>

// The realm boundaries (app -> frame RPC, GraphQL worker -> source) forward calls by name, so they need the method list at runtime
export const SOURCE_METHODS = [
  'home',
  'shorts',
  'subscriptions',
  'history',
  'subscribedChannels',
  'channelUploads',
  'search',
  'searchSuggestions',
  'video',
  'channel',
  'channelAbout',
  'communityPosts',
  'post',
  'watch',
  'transcript',
  'transcriptSearch',
  'comments',
  'postComments',
  'commentReplies',
  'liveChat',
  'liveChatReplay',
  'relatedVideos',
  'playlists',
  'playlist',
  'notifications',
  'unseenNotificationCount',
  'session',
  'rateVideo',
  'removeFromHistory',
  'markNotificationRead',
  'postComment',
  'sendLiveChatMessage',
  'replyToComment',
  'rateComment',
  'setSubscribed',
  'setNotificationLevel',
  'addToPlaylist',
  'removeFromPlaylist',
  'createPlaylist',
  'deletePlaylist',
  'renamePlaylist',
  'setPlaylistDescription',
  'setPlaylistPrivacy',
  'movePlaylistItem',
] as const satisfies readonly (keyof SourceApi)[]

export type SourceMethod = (typeof SOURCE_METHODS)[number]

export type Exhaustive<Unlisted extends never> = Unlisted

export type SourceMethodsAreExhaustive = Exhaustive<Exclude<keyof SourceApi, SourceMethod>>

// The index marks which argument carries a cursor: a call that passes one must fail rather than silently replay from the start
export const SOURCE_CURSOR_ARGUMENT = {
  home: 1,
  shorts: 1,
  subscriptions: 0,
  history: 0,
  search: 2,
  channel: 4,
  comments: 2,
  postComments: 3,
  commentReplies: 0,
  liveChat: 1,
  liveChatReplay: 3,
  relatedVideos: 0,
  communityPosts: 1,
  notifications: 0,
  playlists: 0,
  playlist: 1,
} as const satisfies Partial<Record<SourceMethod, number>>

// src/sources/runtime.ts replays a failed call unless the policy forbids it: every write method MUST be 'never'
export const SOURCE_REPLAY = {
  home: 'unless-cursor',
  shorts: 'unless-cursor',
  subscriptions: 'unless-cursor',
  history: 'unless-cursor',
  subscribedChannels: 'always',
  channelUploads: 'always',
  search: 'unless-cursor',
  searchSuggestions: 'always',
  video: 'always',
  channel: 'unless-cursor',
  channelAbout: 'always',
  communityPosts: 'unless-cursor',
  post: 'always',
  watch: 'always',
  transcript: 'always',
  transcriptSearch: 'always',
  comments: 'unless-cursor',
  postComments: 'unless-cursor',
  commentReplies: 'unless-cursor',
  liveChat: 'unless-cursor',
  liveChatReplay: 'unless-cursor',
  relatedVideos: 'unless-cursor',
  playlists: 'unless-cursor',
  playlist: 'unless-cursor',
  notifications: 'unless-cursor',
  unseenNotificationCount: 'always',
  session: 'always',
  rateVideo: 'never',
  removeFromHistory: 'never',
  markNotificationRead: 'never',
  postComment: 'never',
  sendLiveChatMessage: 'never',
  replyToComment: 'never',
  rateComment: 'never',
  setSubscribed: 'never',
  setNotificationLevel: 'never',
  addToPlaylist: 'never',
  removeFromPlaylist: 'never',
  createPlaylist: 'never',
  deletePlaylist: 'never',
  renamePlaylist: 'never',
  setPlaylistDescription: 'never',
  setPlaylistPrivacy: 'never',
  movePlaylistItem: 'never',
} as const satisfies Record<SourceMethod, 'always' | 'unless-cursor' | 'never'>

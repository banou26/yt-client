/**
 * Whether a channel Home row draws as youtube.com's grid of full-size cards that Show more opens. Only an expandable
 * row of videos, playlists or posts does: the grid has no card for a channel or a game, so a row of those keeps the rail.
 */
export const isRichRow = (row: { expandable?: boolean | null, videos: unknown[], playlists: unknown[], posts: unknown[] }) =>
  row.expandable === true && row.videos.length + row.playlists.length + row.posts.length > 0

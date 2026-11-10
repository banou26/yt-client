/** A server the browser reaches itself, not through FKN, so it sees the viewer's IP address. */
export type DirectHost = { domain: string, what: string }

/**
 * Every server the browser reaches itself, as the privacy page lists them. A domain covers its subdomains, since
 * YouTube's answers pick the exact server (`i.ytimg.com`, `i4.ytimg.com`). tests/unit/privacy-hosts.test.ts holds it
 * to the code's own urls and to real YouTube answers, tests/browser/privacy.spec.ts to what the page shows.
 */
export const DIRECT_HOSTS: readonly DirectHost[] = [
  { domain: 'www.youtube.com', what: 'YouTube\'s API while yt-client is not signed in to YouTube, with your searches, what you open and your YouTube visitor ID' },
  { domain: 'ytimg.com', what: 'Video thumbnails and preview frames' },
  { domain: 'ggpht.com', what: 'Channel pictures, post images and channel emoji' },
  { domain: 'googleusercontent.com', what: 'Channel pictures, banners and song covers' },
  { domain: 'fonts.gstatic.com', what: 'Live chat emoji' },
  { domain: 'returnyoutubedislikeapi.com', what: 'Dislike counts from Return YouTube Dislike, which gets the ID of each video you open' },
  {
    domain: 'ajay.app',
    what: 'SponsorBlock\'s sponsor segments, asked for with the first 4 characters of a hash of the video\'s ID, which about 150 videos in SponsorBlock share',
  },
]

/** FKN's own servers: the broker, relay, WebVPN and storage.fkn.app under fkn.app, and the render proxy page the BotGuard agent runs in on sdbx.app. */
export const FKN_DOMAINS: readonly string[] = ['fkn.app', 'sdbx.app']

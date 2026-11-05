/** A server the browser reaches itself, not through FKN, so it sees the viewer's IP address. */
export type DirectHost = { domain: string, what: string }

/**
 * Every server the browser reaches itself, as the privacy page lists them. A domain covers its subdomains, since
 * YouTube's answers pick the exact server (`i.ytimg.com`, `i4.ytimg.com`). tests/unit/privacy-hosts.test.ts holds it
 * to the code's own urls and to real YouTube answers, tests/browser/privacy.spec.ts to what the page shows.
 * The page's "Where requests go" text says YouTube's pages and API go through FKN, so listing www.youtube.com here
 * means rewording that text in the same change.
 */
export const DIRECT_HOSTS: readonly DirectHost[] = [
  { domain: 'ytimg.com', what: 'Video thumbnails and preview frames' },
  { domain: 'ggpht.com', what: 'Channel pictures, post images and channel emoji' },
  { domain: 'googleusercontent.com', what: 'Channel pictures and banners' },
  { domain: 'fonts.googleapis.com', what: 'The Roboto font' },
  { domain: 'fonts.gstatic.com', what: 'The Roboto font and live chat emoji' },
]

/** FKN's own servers: the broker, relay, WebVPN and storage.fkn.app under fkn.app, and the render proxy page the BotGuard agent runs in on sdbx.app. */
export const FKN_DOMAINS: readonly string[] = ['fkn.app', 'sdbx.app']

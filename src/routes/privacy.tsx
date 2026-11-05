import { css } from '@emotion/react'

import { useDocumentTitle } from '../app'
import { DIRECT_HOSTS, FKN_DOMAINS } from '../privacy-hosts'

const FKN_PRIVACY_URL = 'https://fkn.app/privacy'
const EXTENSION_PRIVACY_URL = 'https://fkn.app/extension/privacy'

const KEPT: { title: string, what: string }[] = [
  {
    title: 'Settings',
    what: 'Your theme, autoplay, volume and mute, quality, speed, captions and their language, and theater mode, whether the guide is collapsed, whether to offer the FKN extension, and whether it was there on your last visit. Kept until you change them.',
  },
  {
    title: 'Channel groups',
    what: 'Each group\'s name and emoji, and the name, ID and picture address of each channel in it. Kept until you delete the group on the Groups page.',
  },
  {
    title: 'Your YouTube session',
    what: 'The cookies YouTube and Google set while you use yt-client, your sign-in included. Kept until they expire or you sign out, which removes all of them.',
  },
  {
    title: 'Your YouTube visitor ID',
    what: 'The ID YouTube gives this browser, and the YouTube video server it last used. Replaced when you sign in, sign out or switch accounts.',
  },
  {
    title: 'Playback tokens',
    what: 'A token from YouTube\'s playback check for each video played, previews included, filed under the video\'s ID. Each lasts six hours at most and is removed the next time a token is saved after that. All of them go when you sign in, sign out or switch accounts.',
  },
  {
    title: 'The account you picked',
    what: 'Which of your Google accounts yt-client uses, when you picked one other than the first. It stays after you sign out, and goes when you pick the first account again.',
  },
  {
    title: 'YouTube\'s session details and player code',
    what: 'Kept by youtubei.js, the library yt-client reads YouTube with. The session details go when you sign in, sign out or switch accounts. The player code stays.',
  },
  {
    title: 'What YouTube\'s and Google\'s pages keep',
    what: 'The sign-in window opens youtube.com and Google\'s sign-in page, and their own code keeps its data in this browser, as it would on those sites. It stays until you clear this site\'s data.',
  },
  {
    title: 'Imported watch history',
    what: 'If you import it with the FKN extension: each video\'s ID, title, thumbnail, length, how much of it you watched, its channel and the day YouTube lists it under, when you imported it, and a digest of the youtube.com sign-in it was read with, never the cookie itself. Kept until you choose Delete imported history on the History page, or until that page finds this browser\'s youtube.com sign-in gone or changed.',
  },
  {
    title: 'The version a tab loaded',
    what: 'Kept until the tab closes, so that an update reloads an open tab only once.',
  },
]

const style = css`
  max-width: 78rem;
  padding: 2.4rem 1.6rem;
  color: var(--text-primary);
  font-size: 1.4rem;
  line-height: 2.2rem;

  .heading {
    margin: 0 0 2.4rem;
    font-size: 2.4rem;
    font-weight: 700;
  }

  .section {
    padding: 2.4rem 0;
    border-top: 1px solid var(--border-subtle);
  }

  .section-title {
    margin: 0 0 1.2rem;
    font-size: 1.6rem;
    font-weight: 500;
  }

  p {
    margin: 0 0 1.2rem;
  }

  ul {
    margin: 0 0 1.2rem;
    padding-left: 2rem;
    list-style: disc;
  }

  li + li {
    margin-top: 0.8rem;
  }

  .host {
    color: var(--text-secondary);
  }

  .link {
    color: var(--accent);
  }
`

export const PrivacyPage = () => {
  useDocumentTitle('Privacy')

  return (
    <main css={style}>
      <h1 className='heading'>Privacy</h1>
      <p>yt-client is a YouTube client that runs in your browser.</p>

      <section className='section'>
        <h2 className='section-title'>What yt-client keeps in this browser</h2>
        <ul>
          {KEPT.map(item => (
            <li key={item.title}><strong>{item.title}.</strong> {item.what}</li>
          ))}
        </ul>
        <p>Sign out is in the account menu. Clearing this site's data in your browser removes everything above.</p>
      </section>

      <section className='section'>
        <h2 className='section-title'>Where requests go</h2>
        <p>
          Without the FKN browser extension, yt-client reaches YouTube's pages, API and video through FKN, the platform it
          runs on, so YouTube sees FKN's address there rather than yours. Thumbnails, pictures and fonts are the
          exception: your browser loads them itself, from the servers listed further down.
        </p>
        <ul>
          <li>
            YouTube's pages and API go through the FKN relay, which makes each request for you. When you are signed in,
            your YouTube cookies go with each request. The relay keeps answers in a cache so it can serve the same request
            again, for about an hour, less for an error. That includes answers to signed-in requests, which can hold your
            details on YouTube. Each answer is sealed: it is encrypted with a key made from the whole request, cookies
            included, and filed under a digest of that request, a short fingerprint of it, not under who sent it. Only an
            identical request can find and open it.
          </li>
          <li>
            Video, and the checks YouTube runs before playing it, go over WebVPN: your browser encrypts the connection to
            YouTube's servers end to end, so the WebVPN relay carrying it cannot read it. The relay sees which server and
            port it reaches and how much data passes.
          </li>
          <li>Signing in goes over WebVPN the same way, with or without the extension.</li>
        </ul>
        <p>
          With the FKN browser extension installed, requests to YouTube go from your browser through the extension when it
          can make them, so YouTube sees your IP address. Importing your watch history needs the extension: it reads your
          history with this browser's own youtube.com sign-in, through the extension and not through FKN.
        </p>
        <p>When a video or a preview starts, yt-client tells YouTube it started playing, with the report youtube.com sends at that point.</p>
        <p>
          What FKN keeps, in this browser and on its servers, is in the{' '}
          <a className='link' href={FKN_PRIVACY_URL} target='_blank' rel='noreferrer'>FKN privacy policy</a>
          . What the extension keeps is in the{' '}
          <a className='link' href={EXTENSION_PRIVACY_URL} target='_blank' rel='noreferrer'>extension privacy policy</a>
          .
        </p>
      </section>

      <section className='section'>
        <h2 className='section-title'>Servers your browser reaches itself</h2>
        <p>
          These load straight from your browser, not through FKN, so each of them sees your IP address and what it serves
          you. Each name includes its subdomains, such as i.ytimg.com.
        </p>
        <ul data-direct-hosts=''>
          {DIRECT_HOSTS.map(host => (
            <li key={host.domain}>{host.what}: <span className='host'>{host.domain}</span></li>
          ))}
        </ul>
        <p>
          Your browser also reaches FKN's own servers ({FKN_DOMAINS.join(' and ')}), and loads yt-client itself from
          youtube.fkn.app, which Cloudflare serves for FKN, so Cloudflare sees your IP address too.
        </p>
      </section>

      <section className='section'>
        <h2 className='section-title'>What yt-client does not do</h2>
        <ul>
          <li>It has no account and no server of its own, and runs no analytics.</li>
          <li>Nothing it keeps leaves this browser except in the requests to YouTube that need it, through FKN or the extension as above.</li>
          <li>Apart from the relay's sealed answers above, FKN keeps no copy of anything yt-client keeps in this browser.</li>
        </ul>
      </section>
    </main>
  )
}

export default PrivacyPage

import type { ChannelAboutQuery } from '../generated/graphql'

import { css } from '@emotion/react'

import { Dialog } from '../components/ui/dialog'
import { gql } from '../generated'

export const CHANNEL_ABOUT_QUERY = gql(`
  query ChannelAbout($id: ID!) {
    channelAbout(id: $id) {
      description
      country
      joinedDateText
      viewCountText
      subscriberCountText
      videoCountText
      links { title url displayUrl }
    }
  }
`)

type About = NonNullable<ChannelAboutQuery['channelAbout']>

const style = css`
  h3 {
    margin: 2.4rem 0 1.2rem;
    font-size: 2rem;
    font-weight: 700;
  }

  h3:first-child {
    margin-top: 0;
  }

  .about-description {
    margin: 0;
    font-size: 1.4rem;
    line-height: 2rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 1.4rem;
    line-height: 2rem;
  }

  .about-links li {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .about-links a {
    overflow: hidden;
    color: var(--accent);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

export const ChannelAboutDialog = (
  { name, about, description, onClose }: {
    name: string
    about?: About
    // the header's own, shown until the panel arrives
    description?: string | null
    onClose: () => void
  },
) => {
  const text = about?.description ?? description
  const details = [
    about?.country,
    about?.joinedDateText,
    about?.subscriberCountText,
    about?.videoCountText,
    about?.viewCountText,
  ].filter(detail => detail !== undefined && detail !== null && detail !== '')
  return (
    <Dialog title={name} onClose={onClose}>
      <div css={style}>
        {text
          ? (
            <>
              <h3>Description</h3>
              <p className='about-description'>{text}</p>
            </>
          )
          : undefined}
        {about && about.links.length > 0
          ? (
            <>
              <h3>Links</h3>
              <ul className='about-links'>
                {about.links.map(link => (
                  <li key={link.url}>
                    <span>{link.title}</span>
                    <a href={link.url} target='_blank' rel='noreferrer noopener'>{link.displayUrl ?? link.url}</a>
                  </li>
                ))}
              </ul>
            </>
          )
          : undefined}
        {details.length > 0
          ? (
            <>
              <h3>More info</h3>
              <ul className='about-details'>
                {details.map(detail => <li key={detail}>{detail}</li>)}
              </ul>
            </>
          )
          : undefined}
      </div>
    </Dialog>
  )
}

export default ChannelAboutDialog

import type { VideoCardData } from './video-card'

import { css } from '@emotion/react'
import { Link } from 'wouter'

import { VideoCardCompact } from './video-card-compact'

export type PostCardData = {
  id: string
  text: string
  publishedText?: string | null
  voteCountText?: string | null
  attachedImage?: string | null
  author?: { id: string, name: string, avatar?: string | null } | null
  attachedVideo?: VideoCardData | null
}

const style = css`
  padding: 1.6rem;
  border: 1px solid var(--border-subtle);
  border-radius: 1.2rem;

  .post-head {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    font-size: 1.3rem;
    color: var(--text-secondary);
  }

  .post-author {
    display: inline-flex;
    align-items: center;
    gap: 0.8rem;
    color: var(--text-primary);
    font-weight: 500;
  }

  .post-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    object-fit: cover;
    background: var(--bg-chip);
    font-size: 1.1rem;
  }

  .post-text {
    margin: 1.2rem 0 0;
    font-size: 1.4rem;
    line-height: 2rem;
    color: var(--text-primary);
    white-space: pre-wrap;
  }

  .post-image {
    display: block;
    width: 100%;
    margin-top: 1.2rem;
    border-radius: 0.8rem;
  }

  .post-votes {
    margin-top: 1.2rem;
    font-size: 1.3rem;
    color: var(--text-secondary);
  }
`

/** A channel post, on a channel's Posts tab or in a row of a topic channel's Home. */
export const PostCard = ({ post }: { post: PostCardData }) => (
  <article css={style} className='post'>
    <div className='post-head'>
      {post.author
        ? (
          <Link href={`/channel/${post.author.id}`} className='post-author'>
            {post.author.avatar
              ? <img className='post-avatar' src={post.author.avatar} alt='' loading='lazy' />
              : <span className='post-avatar' aria-hidden='true'>{post.author.name.slice(0, 1)}</span>}
            <span>{post.author.name}</span>
          </Link>
        )
        : undefined}
      {post.publishedText ? <span className='post-date'>{post.publishedText}</span> : undefined}
    </div>
    {post.text ? <p className='post-text'>{post.text}</p> : undefined}
    {post.attachedImage
      ? <img className='post-image' src={post.attachedImage} alt='' loading='lazy' />
      : undefined}
    {post.attachedVideo ? <VideoCardCompact video={post.attachedVideo} /> : undefined}
    {post.voteCountText ? <div className='post-votes'>{post.voteCountText}</div> : undefined}
  </article>
)

export default PostCard

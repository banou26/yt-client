import type { VideoCardData } from './video-card'

import { css } from '@emotion/react'
import { MessageSquareText, ThumbsUp } from 'lucide-react'
import { Link } from 'wouter'

import { ReadMore } from './read-more'
import { VideoCardCompact } from './video-card-compact'

export type PostCardData = {
  id: string
  text: string
  publishedText?: string | null
  voteCountText?: string | null
  commentCountText?: string | null
  commentCountLabel?: string | null
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
    margin-top: 1.2rem;
    font-size: 1.6rem;
    line-height: 2.2rem;
    color: var(--text-primary);
    white-space: pre-wrap;
  }

  .post-image {
    display: block;
    width: 100%;
    margin-top: 1.2rem;
    border-radius: 0.8rem;
  }

  .post-footer {
    display: flex;
    align-items: center;
    gap: 1.6rem;
    margin-top: 0.8rem;
    font-size: 1.2rem;
    color: var(--text-primary);
  }

  .post-votes,
  .post-comments {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .post-comments {
    height: 3.2rem;
    padding: 0 1.2rem;
    border-radius: 1.6rem;
    font-weight: 500;
    transition: background 0.15s ease;
  }

  .post-comments:hover {
    background: var(--bg-hover);
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
    {post.text ? <ReadMore className='post-text' text={post.text}>{post.text}</ReadMore> : undefined}
    {post.attachedImage
      ? <img className='post-image' src={post.attachedImage} alt='' loading='lazy' />
      : undefined}
    {post.attachedVideo ? <VideoCardCompact video={post.attachedVideo} /> : undefined}
    {post.voteCountText || post.commentCountText
      ? (
        <div className='post-footer'>
          {post.voteCountText
            ? <span className='post-votes'><ThumbsUp size={18} strokeWidth={1.5} />{post.voteCountText}</span>
            : undefined}
          {post.commentCountText
            ? (
              <Link
                href={`/post/${post.id}`}
                className='post-comments'
                aria-label={post.commentCountLabel ?? `${post.commentCountText} comments`}
              >
                <MessageSquareText size={18} strokeWidth={1.5} />
                {post.commentCountText}
              </Link>
            )
            : undefined}
        </div>
      )
      : undefined}
  </article>
)

export default PostCard

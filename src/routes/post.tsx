import { css } from '@emotion/react'
import { useQuery } from 'urql'

import { useDocumentTitle } from '../app'
import { Comments } from '../components/comments'
import { DataFailure } from '../components/data-failure'
import { safeDecode } from '../components/format'
import { PostCard } from '../components/post-card'
import { gql } from '../generated'

const POST_QUERY = gql(`
  query PostView($id: ID!) {
    post(id: $id) {
      id
      text
      publishedText
      voteCountText
      attachedImage
      author { id name avatar }
      attachedVideo {
        id
        title
        thumbnail
        thumbnailSrcset
        durationSeconds
        viewCount
        publishedText
        channel { id name }
      }
    }
  }
`)

/* youtube.com draws the post 642px wide at the left of a centred column that
   widens in 218px steps, up to six, and its comments under it 852px wide.
   Measured at 1000 to 1920px wide, 2026-11-10. */
const style = css`
  width: max(min(100% - 3.2rem, 64.2rem), min(130.8rem, round(down, 100% - 4.8rem, 21.8rem)));
  margin: 0 auto;
  padding: 2.4rem 0;

  .post {
    max-width: 64.2rem;
  }

  .comments-column {
    max-width: 85.2rem;
  }

  .status {
    color: var(--text-secondary);
  }
`

export const PostPage = ({ params }: { params: { postId: string } }) => {
  const [{ data, error, fetching }, reexecute] = useQuery({ query: POST_QUERY, variables: { id: safeDecode(params.postId) } })
  const post = data?.post
  useDocumentTitle(post?.text.split('\n')[0] || 'Post')
  return (
    <main css={style}>
      {post ? <PostCard post={post} /> : undefined}
      {post?.author
        ? (
          <div className='comments-column'>
            <Comments key={post.id} post={{ id: post.id, channelId: post.author.id }} />
          </div>
        )
        : undefined}
      {data && !post ? <p className='status'>This post isn't available.</p> : undefined}
      {error && !fetching ? <DataFailure error={error} reexecute={reexecute} /> : undefined}
    </main>
  )
}

export default PostPage

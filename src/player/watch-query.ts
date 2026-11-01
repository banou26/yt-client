import { gql } from '../generated'

/**
 * The watch page's read, shared with the persistent player so both subscribe
 * to ONE operation: urql runs a single /next for the two when the document and
 * the variables match, and the player needs the related list and the queue to
 * decide what the end of the video moves on to.
 */
export const WATCH_META_QUERY = gql(`
  query WatchMeta($id: ID!, $playlistId: ID, $playlistIndex: Int) {
    watch(id: $id, playlistId: $playlistId, playlistIndex: $playlistIndex) {
      id
      isLive
      concurrentViewers
      title
      viewCountText
      publishedDateText
      shortViewCountText
      relativeDateText
      hashtags
      likeCountText
      commentCountText
      description
      descriptionRuns { text url videoId startSeconds browseId }
      likeStatus
      channel { id name avatar handle subscriberCountText isSubscribed notificationLevel }
      relatedCursor
      autoplayId
      related {
        id
        title
        thumbnail
        thumbnailSrcset
        durationSeconds
        viewCount
        publishedText
        isLive
        channel { id name }
      }
      playlist {
        id
        title
        author
        currentIndex
        isInfinite
        items {
          id
          title
          thumbnail
          thumbnailSrcset
          durationSeconds
        }
      }
    }
  }
`)

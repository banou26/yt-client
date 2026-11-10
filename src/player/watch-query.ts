import type { WatchMetaQuery } from '../generated/graphql'

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
      unavailableText
      isLive
      hasChatReplay
      concurrentViewers
      title
      isMembersOnly
      commentsHidden
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
      channel { id name avatar handle subscriberCountText isSubscribed notificationLevel isVerified isVerifiedArtist }
      byline { text isVerified isVerifiedArtist }
      collaborators { id name avatar handle subscriberCountText isSubscribed notificationLevel isVerified isVerifiedArtist }
      relatedCursor
      autoplayId
      chapters { title startSeconds thumbnail }
      transcriptPanel { panelId params }
      music { countText channelId songs { title artist album thumbnail videoId } }
      channelCard {
        id
        name
        avatar
        subscriberCountText
        videosUrl
        aboutUrl
        links { title url }
        cards { title subtitle thumbnail duration videoId channelId url }
      }
      cardTeasers { text startMs durationMs }
      related {
        id
        title
        thumbnail
        thumbnailSrcset
        animatedThumbnail
        thumbnailBadge
        durationSeconds
        isMusic
        viewCount
        viewCountIcon
        publishedText
        metaDelimiter
        isLive
        isMembersOnly
        channel { id name isVerified isVerifiedArtist }
        byline { text isVerified isVerifiedArtist }
        collaborators { id name avatar handle subscriberCountText isVerified isVerifiedArtist }
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

type Watch = NonNullable<WatchMetaQuery['watch']>

/** What a description box shows of a video, as the watch page and the full screen description panel both draw it. */
export const descriptionOf = (watch: Watch) => ({
  viewCountText: watch.viewCountText,
  publishedDateText: watch.publishedDateText,
  shortViewCountText: watch.shortViewCountText,
  relativeDateText: watch.relativeDateText,
  hashtags: watch.hashtags,
  description: watch.description,
  runs: watch.descriptionRuns,
  music: watch.music,
  channelCard: watch.channelCard,
})

export type Description = ReturnType<typeof descriptionOf>

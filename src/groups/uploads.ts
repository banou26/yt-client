export type UploadSort = 'latest' | 'popular'

type Upload = { id: string, publishedAt?: string | null, viewCount?: string | null }

const timeOf = (upload: Upload) => (upload.publishedAt ? Date.parse(upload.publishedAt) : Number.NaN) || 0

const viewsOf = (upload: Upload) => Number(upload.viewCount) || 0

/**
 * The uploads of several channels as one list, each video once: newest first, or most viewed first with the
 * newest ahead on a tie. A video with no time or no view count sorts last.
 */
export const mergeUploads = <Video extends Upload>(lists: Video[][], sort: UploadSort): Video[] => {
  const byId = new Map<string, Video>()
  for (const list of lists) for (const video of list) if (!byId.has(video.id)) byId.set(video.id, video)
  const newest = (a: Video, b: Video) => timeOf(b) - timeOf(a)
  return [...byId.values()].sort(sort === 'popular' ? (a, b) => viewsOf(b) - viewsOf(a) || newest(a, b) : newest)
}

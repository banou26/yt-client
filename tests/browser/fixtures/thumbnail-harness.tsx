import { render } from 'preact'

import { VideoCardCompact } from '../../../src/components/video-card-compact'
import { VideoGrid } from '../../../src/components/video-grid'

const video = (thumbnail: string, index: number) => ({ id: `video-${index}`, title: `Video ${index}`, thumbnail })

// served by the dev server and imported from a spec: a grid card per thumbnail and a related-column card for the
// last one, over the page so every card is in view and its lazy thumbnail loads
export const mountThumbnails = (grid: string[], compact: string) => {
  const host = document.createElement('div')
  host.setAttribute('data-thumbnail-harness', '')
  host.style.cssText = 'position: fixed; inset: 0; z-index: 10000; overflow: auto; padding: 2rem; background: var(--bg-base)'
  document.body.append(host)
  render(
    <div>
      <VideoGrid videos={grid.map(video)} />
      <VideoCardCompact video={video(compact, grid.length)} />
    </div>,
    host,
  )
}

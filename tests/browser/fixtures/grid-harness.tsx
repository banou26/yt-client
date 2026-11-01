import { render } from 'preact'

import { ShortsShelf } from '../../../src/components/shorts-shelf'
import { VideoGrid } from '../../../src/components/video-grid'

const videos = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index}`, title: `Video ${index}` }))

// served by the dev server and imported from a spec, to lay out the real home grid with no feed behind it
export const mountGrid = (width: number) => {
  const host = document.createElement('div')
  host.setAttribute('data-grid-harness', '')
  host.style.width = `${width}px`
  document.body.append(host)
  // one self-closing tag per line: tests/unit/launch-points.test.ts reads the slashes of two on one line as a regex
  const shelf = <ShortsShelf shorts={videos(6, 'short-')} />
  render(<VideoGrid videos={videos(14, 'video-')} shelf={shelf} />, host)
}

import { render } from 'preact'

import { ChapterStrip } from '../../../src/components/chapters'
import { cardParamsIn } from '../../../src/player/card-params'

export const PARAMS = 'YAHIAQGiBhUBqHapM4pS7yURthtEeAtKvDyfuqPSBwkJ7hwBhyohjO8='

// served by the dev server and imported from a spec: the strip of C3zuzzDLLck's search row, with its inline playback
// params and no search behind it
export const mountStrip = () => {
  const host = document.createElement('div')
  host.setAttribute('data-chapters-harness', '')
  host.style.width = '600px'
  document.body.append(host)
  const chapters = [
    { title: 'Intro', startSeconds: 0 },
    { title: 'Disassembly', startSeconds: 50 },
    { title: 'Cartridge Replacement', startSeconds: 140 },
  ]
  render(<ChapterStrip videoId='C3zuzzDLLck' chapters={chapters} title='3 auto-generated chapters in this video' playerParams={PARAMS} />, host)
}

// the card params the watch page reads off the history entry a link opened
export const openedWith = () => cardParamsIn(history.state)

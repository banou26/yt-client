import { render } from 'preact'
import { useState } from 'preact/hooks'

import { ReadMore } from '../../../src/components/read-more'

const host = (name: string) => {
  const element = document.createElement('div')
  element.setAttribute('data-posts-harness', name)
  document.body.append(element)
  return element
}

// served by the dev server and imported from posts.spec.ts
// a ReadMore whose parent draws it again, with the same text in new children, each time the returned function is called
export const mountReadMore = () => {
  let drawAgain = () => {}
  const Parent = () => {
    const [, setCount] = useState(0)
    drawAgain = () => setCount(count => count + 1)
    return (
      <ReadMore text='a post'>
        <span>a post</span>
      </ReadMore>
    )
  }
  render(<Parent />, host('read-more'))
  return () => drawAgain()
}

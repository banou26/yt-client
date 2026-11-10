import { render } from 'preact'
import { useState } from 'preact/hooks'
import { Parser, YT } from 'youtubei.js'

import { ReadMore } from '../../../src/components/read-more'
import { ChannelHome } from '../../../src/routes/channel-home'
import { createYoutubeSource } from '../../../src/sources/youtube'
import topics from '../../unit/fixtures/topic-channels.json'

const host = (name: string) => {
  const element = document.createElement('div')
  element.setAttribute('data-posts-harness', name)
  document.body.append(element)
  return element
}

// served by the dev server and imported from posts.spec.ts, to render News's Home from its recorded Hong Kong answer,
// whose one row is of posts
export const mountTopicHome = async () => {
  const source = createYoutubeSource({
    fetch: globalThis.fetch,
    createClient: async () => ({
      getChannel: async () => new YT.Channel(undefined as never, Parser.parseResponse(topics.newsHongKong as never), true),
    }) as never,
  })
  const page = await source.channel('UCYfdidRxbB8Qhf0Nx7ioOYw')
  render(<ChannelHome home={page.home as never} />, host('topic-home'))
}

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

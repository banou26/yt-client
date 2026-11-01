import { describe, expect, it } from 'vite-plus/test'

import { YTNodes } from 'youtubei.js'

import { normalizeLockupVideo } from '../../../../src/sources/youtube/normalize'

// pins this repo's youtubei.js patch: without it the parser drops the icon and no lockup is ever badged
describe('the lockup badge icon', () => {
  it('survives youtubei.js parsing a lockup\'s metadata', () => {
    const view = new YTNodes.ContentMetadataView({
      metadataRows: [
        { metadataParts: [{ text: { content: 'BBC' }, icon: { name: 'CHECK_CIRCLE_FILLED', accessibilityLabel: 'Verified' } }] },
        { metadataParts: [{ text: { content: '5.6M views' } }] },
      ],
    })
    const video = normalizeLockupVideo({
      content_id: 'abc',
      content_type: 'VIDEO',
      metadata: {
        title: { text: 'A video' },
        image: { renderer_context: { command_context: { on_tap: { payload: { browseId: 'UCCj956IF62FbT7Gouszaj9w' } } } } },
        metadata: view,
      },
    })
    expect(video?.channel).toMatchObject({ name: 'BBC', isVerified: true })
  })
})

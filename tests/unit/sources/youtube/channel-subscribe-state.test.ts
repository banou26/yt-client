import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser, YT } from 'youtubei.js'

import { normalizeChannel } from '../../../../src/sources/youtube/normalize'
import fixture from '../../fixtures/channel-page-header.json'

/* channel-page-header.json holds two signed-in channel browses captured on 2026-11-02, reduced to the page header's
   subscribe button, the channel metadata and the entity store: Awesome World (subscribed) and Blender (not subscribed,
   with the entities of the channels its home tab features). Runs the real upstream parser, which is the only thing that
   proves the youtubei.js patch in patches/ is applied: without it the header's state never reaches the Channel. */

const parse = (response: unknown) => normalizeChannel(new YT.Channel(undefined as never, Parser.parseResponse(response as never), true))

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('channel subscribe state', () => {
  it('reads a subscribed page header off the entity store', () => {
    expect(parse(fixture.subscribed)).toMatchObject({ id: 'UC3XwA9aaZdWfojyo9wKaFtw', isSubscribed: true })
  })

  it('reads a page header that is not subscribed', () => {
    expect(parse(fixture.unsubscribed)).toMatchObject({ id: 'UCSMOQeBJ2RAnuFungnQOxLg', isSubscribed: false })
  })

  it('reads the header channel and not another channel the page carries', () => {
    const response = clone(fixture.unsubscribed)
    const featured = response.frameworkUpdates.entityBatchUpdate.mutations[0]!.payload.subscriptionStateEntity!
    featured.subscribed = true
    expect(parse(response).isSubscribed).toBe(false)
  })

  it('leaves the state absent signed out, where the header has no subscribe button', () => {
    const response = clone(fixture.subscribed)
    response.header.pageHeaderRenderer.content.pageHeaderViewModel.actions.flexibleActionsViewModel.actionsRows[0]!.actions = [
      { buttonViewModel: { title: 'Subscribe' } } as never,
    ]
    const { frameworkUpdates: _store, ...signedOut } = response
    expect(parse(signedOut).isSubscribed).toBeUndefined()
  })

  it('still reads the legacy header subscribe button', () => {
    expect(normalizeChannel({
      metadata: { external_id: 'UC123', title: 'Channel' },
      subscribe_button: { subscribed: true },
    }).isSubscribed).toBe(true)
  })
})

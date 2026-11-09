import { describe, expect, it } from 'vite-plus/test'

import { lazyRoute, RouteLoadError } from '../../../src/components/lazy-route'

const Page = () => null

const thrownBy = (render: () => unknown) => {
  try {
    render()
  } catch (thrown) {
    return thrown
  }
  throw new Error('rendered without suspending or failing')
}

describe('lazyRoute', () => {
  it('imports a route again after its download failed, and only once per render after the failure', async () => {
    let imports = 0
    const Route = lazyRoute(async () => {
      imports += 1
      if (imports === 1) throw new TypeError('Failed to fetch dynamically imported module: /assets/search-x.js')
      return { default: Page }
    }) as (props: object) => unknown

    const pending = thrownBy(() => Route({}))
    expect(thrownBy(() => Route({}))).toBe(pending)
    await pending

    const failure = thrownBy(() => Route({}))
    expect(failure).toBeInstanceOf(RouteLoadError)
    expect((failure as RouteLoadError).message).toBe('Failed to fetch dynamically imported module: /assets/search-x.js')
    expect(imports).toBe(1)

    await thrownBy(() => Route({}))
    expect(imports).toBe(2)
    expect(Route({ params: {} })).toMatchObject({ type: Page, props: { params: {} } })
  })
})

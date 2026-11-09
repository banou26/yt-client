import type { Page } from '@playwright/test'

import { test as base } from '@playwright/test'

export { expect } from '@playwright/test'

// FKN shows this notice over the bottom corner once the day's free data is used
export const dismissFknNotice = (page: Page) =>
  page.addLocatorHandler(
    page.frameLocator('iframe[title="FKN"]').getByRole('button', { name: 'Dismiss', exact: true }),
    dismiss => dismiss.click(),
  )

export const test = base.extend({
  // the watch page's third-party lookups answer with nothing unless a spec routes them itself (a page route wins over
  // a context route), so no spec depends on their live data
  context: async ({ context }, use) => {
    await context.route('https://returnyoutubedislikeapi.com/**', route =>
      route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { likes: 0, dislikes: 0 } }))
    await use(context)
  },
  page: async ({ page }, use) => {
    await dismissFknNotice(page)
    await use(page)
  },
})

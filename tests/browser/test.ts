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
  page: async ({ page }, use) => {
    await dismissFknNotice(page)
    await use(page)
  },
})

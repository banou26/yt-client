import { chromium, expect, test } from '@playwright/test'

import { extensionBuild } from './extension-build'

test.describe('with the FKN extension installed', () => {
  test('serves egress itself, and stops the header offering itself', async () => {
    test.setTimeout(180_000)
    const build = extensionBuild(process.env)
    test.skip(build.skip !== undefined, `YT_EXTENSION_BUILD=skip: ${build.skip}`)
    const context = await chromium.launchPersistentContext('', {
      headless: true,
      executablePath: '/etc/profiles/per-user/banou/bin/google-chrome',
      // playwright's --disable-extensions default defeats the load, and --load-extension no longer works
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--mute-audio', '--enable-unsafe-extension-debugging', '--autoplay-policy=no-user-gesture-required'],
      viewport: { width: 1440, height: 900 },
    })

    try {
      const session = await context.browser()!.newBrowserCDPSession()
      await session.send('Extensions.loadUnpacked' as 'Browser.getVersion', { path: build.path } as object)
      if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker')

      const page = await context.newPage()
      const egress: string[] = []
      page.on('console', message => {
        if (message.text().includes('egress →')) egress.push(message.text())
      })

      await page.goto('http://localhost:4561/results?search_query=blender', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('a[href^="/watch"]').first()).toBeVisible({ timeout: 90_000 })

      await expect(page.locator('html')).toHaveAttribute('data-fkn-extension', 'true')

      await expect.poll(() => egress.length, { timeout: 30_000 }).toBeGreaterThan(0)
      expect(egress.join(' ')).toContain('FKN extension')
      expect(egress.join(' ')).not.toContain('webvpn tunnel')

      await expect(page.getByRole('button', { name: 'Faster with the extension' })).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})

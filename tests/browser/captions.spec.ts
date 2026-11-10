import { expect, startCaptionsOff, test } from './test'

/* Captions end to end, against the live source: `dQw4w9WgXcQ` publishes an authored English track. */

const VIDEO = '/watch?v=dQw4w9WgXcQ'

const firstFrame = async (page: import('@playwright/test').Page) => {
  await page.waitForFunction(
    () => performance.getEntriesByName('yt:first-frame', 'mark').length > 0,
    null,
    { timeout: 120_000 },
  )
}

const shownCues = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const video = document.querySelector('video')
    if (!video) return { tracks: 0, showing: 0, cues: 0 }
    const tracks = [...video.textTracks]
    const showing = tracks.filter((track) => track.mode === 'showing')
    return {
      tracks: tracks.length,
      showing: showing.length,
      cues: showing.reduce((total, track) => total + (track.cues?.length ?? 0), 0),
    }
  })

test('offers a caption track, renders its cues, and takes them away again', async ({ page }) => {
  test.setTimeout(240_000)
  await startCaptionsOff(page)
  await page.goto(VIDEO)
  await firstFrame(page)

  const toggle = page.getByRole('button', { name: 'Turn on captions' })
  await expect(toggle).toBeVisible({ timeout: 30_000 })

  await toggle.click()
  await expect(page.getByRole('button', { name: 'Turn off captions' })).toBeVisible()

  await expect(async () => {
    const shown = await shownCues(page)
    expect(shown.showing, 'no text track was made visible').toBeGreaterThan(0)
    expect(shown.cues, 'the visible track carried no cues').toBeGreaterThan(0)
  }).toPass({ timeout: 60_000 })

  await page.getByRole('button', { name: 'Turn off captions' }).click()
  await expect(async () => {
    const shown = await shownCues(page)
    expect(shown.showing, 'a text track was still showing after captions were turned off').toBe(0)
  }).toPass({ timeout: 15_000 })
})

test('lists the published tracks in the settings menu', async ({ page }) => {
  test.setTimeout(240_000)
  await startCaptionsOff(page)
  await page.goto(VIDEO)
  await firstFrame(page)
  await expect(page.getByRole('button', { name: 'Turn on captions' })).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: 'Settings' }).click()
  const subtitles = page.getByRole('menuitem', { name: /Subtitles/ })
  await expect(subtitles).toBeVisible()
  await expect(subtitles).toBeEnabled()

  await subtitles.click()
  await expect(page.getByRole('menuitem', { name: 'Off' })).toBeVisible()
  const items = page.getByRole('menuitem')
  expect(await items.count()).toBeGreaterThan(1)

  await items.nth(1).click()
  await expect(page.getByRole('button', { name: 'Turn off captions' })).toBeVisible()
})

const showingLanguages = (page: import('@playwright/test').Page) =>
  page.evaluate(() => [...(document.querySelector('video')?.textTracks ?? [])]
    .filter((track) => track.mode === 'showing' && (track.cues?.length ?? 0) > 0)
    .map((track) => track.language))

// youtube.com answers a Japanese browser ON_RECOMMENDED for this video with its Japanese track, and an English one
// OFF_RECOMMENDED (measured 2026-11-10)
test.describe('in a Japanese browser', () => {
  test.use({ locale: 'ja-JP' })

  test('shows the track YouTube recommends without being asked', async ({ page }) => {
    test.setTimeout(240_000)
    await page.goto(VIDEO)
    await firstFrame(page)
    await expect(page.getByRole('button', { name: 'Turn off captions', exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(async () => {
      expect(await showingLanguages(page)).toStrictEqual(['ja'])
    }).toPass({ timeout: 60_000 })
  })

  test('remembers captions turned off, and turns the recommended track back on', async ({ page }) => {
    test.setTimeout(240_000)
    await page.goto(VIDEO)
    await firstFrame(page)
    await page.getByRole('button', { name: 'Turn off captions', exact: true }).click({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Turn on captions', exact: true })).toBeVisible()

    await page.reload()
    await firstFrame(page)
    await expect(page.getByRole('button', { name: 'Turn on captions', exact: true })).toBeVisible({ timeout: 30_000 })
    expect(await showingLanguages(page)).toStrictEqual([])

    // as on youtube.com, turning them back on brings the recommended track rather than the first one listed (Spanish)
    await page.getByRole('button', { name: 'Turn on captions', exact: true }).click()
    await expect(async () => {
      expect(await showingLanguages(page)).toStrictEqual(['ja'])
    }).toPass({ timeout: 60_000 })
  })

  test('keeps the recommended track once Settings always shows captions', async ({ page }) => {
    test.setTimeout(240_000)
    await page.goto('/settings')
    await page.getByRole('checkbox', { name: 'Always show captions', exact: true }).check()

    await page.goto(VIDEO)
    await firstFrame(page)
    await expect(async () => {
      expect(await showingLanguages(page)).toStrictEqual(['ja'])
    }).toPass({ timeout: 60_000 })
  })
})

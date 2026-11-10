import type { Page } from '@playwright/test'

import { cueReader, holdOnCue } from './cues'
import { expect, test } from './test'

// the Subtitles menu's Options against the live source: `dQw4w9WgXcQ` publishes an authored English track

const VIDEO = '/watch?v=dQw4w9WgXcQ'

const startPlayback = async (page: Page) => {
  await page.goto(VIDEO)
  await page.waitForFunction(() => performance.getEntriesByName('yt:first-frame', 'mark').length > 0, null, { timeout: 120_000 })
}

const rows = (page: Page) => page.getByRole('menu').getByRole('menuitem')

const openSubtitles = async (page: Page) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('menuitem', { name: /^Subtitles/ }).click()
}

test('the Options panel restyles the captions, the look stays for the next visit, and Reset puts it back', async ({ page }) => {
  test.setTimeout(300_000)
  await startPlayback(page)
  await page.getByRole('button', { name: 'Turn on captions' }).click()
  await holdOnCue(page)
  const cue = await cueReader(page)
  await expect.poll(async () => (await cue())?.color, { timeout: 30_000 }).toBe('rgb(255, 255, 255)')
  expect(await cue()).toMatchObject({ size: 100, background: 'rgba(8, 8, 8, 0.75)', shadow: 'none' })
  expect((await cue())!.family).toContain('Roboto')

  await openSubtitles(page)
  await expect(rows(page).last()).toHaveText('Options')
  await page.getByRole('menuitem', { name: 'Options' }).click()
  await expect(rows(page)).toHaveText([
    'Options',
    'Font familyProportional Sans-Serif',
    'Font colorWhite',
    'Font size100%',
    'Background colorBlack',
    'Background opacity75%',
    'Character edge styleNone',
    'Font opacity100%',
    'Reset',
  ])
  const pick = async (row: string, choice: string) => {
    await page.getByRole('menuitem', { name: new RegExp(`^${row}`) }).click()
    await page.getByRole('menuitem', { name: choice, exact: true }).click()
    // as on youtube.com, the choices stay open, the pick checked, and the first row goes back
    await expect(page.getByRole('menuitem', { name: choice, exact: true }).locator('svg')).toHaveCount(1)
    await rows(page).first().click()
  }
  await pick('Font color', 'Yellow')
  await pick('Background opacity', '25%')
  await pick('Character edge style', 'Outline')
  await pick('Font family', 'Casual')
  await pick('Font size', '150%')
  await expect(rows(page).nth(1)).toHaveText('Font familyCasual')
  await page.keyboard.press('Escape')

  const styled = {
    color: 'rgb(255, 255, 0)',
    background: 'rgba(8, 8, 8, 0.25)',
    family: '"Comic Sans MS", Impact, Handlee, fantasy',
    size: 125,
  }
  await expect.poll(async () => (await cue())?.color).toBe(styled.color)
  expect(await cue()).toMatchObject(styled)
  expect((await cue())!.shadow).toContain('rgb(34, 34, 34) 0px 0px')

  await startPlayback(page)
  await page.getByRole('button', { name: 'Turn off captions' }).waitFor({ timeout: 30_000 })
  await holdOnCue(page)
  const next = await cueReader(page)
  await expect.poll(async () => (await next())?.color, { timeout: 30_000 }).toBe(styled.color)
  expect(await next()).toMatchObject(styled)

  await openSubtitles(page)
  await page.getByRole('menuitem', { name: 'Options' }).click()
  await page.getByRole('menuitem', { name: 'Reset' }).click()
  await expect(rows(page).nth(2)).toHaveText('Font colorWhite')
  await expect.poll(async () => (await next())?.color).toBe('rgb(255, 255, 255)')
  expect(await next()).toMatchObject({ size: 100, background: 'rgba(8, 8, 8, 0.75)', shadow: 'none' })
  expect((await next())!.family).toContain('Roboto')
})

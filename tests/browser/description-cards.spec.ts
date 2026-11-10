import type { Page } from '@playwright/test'

import { expect, test } from './test'

/* The expanded description's Music section and channel card against the live source, as youtube.com showed them signed
   out on 2026-11-10: dQw4w9WgXcQ lists one song and ends with Rick Astley's card, g6Die8gVFn0 has chapters, no music,
   and ends with Marques Brownlee's card. Counts and the channels' own links are read by their shape, so a new subscriber
   or a new link upstream does not break the specs. */

const expand = async (page: Page, id: string) => {
  await page.goto(`/watch?v=${id}`)
  const box = page.locator('main div:has(> .snippet)')
  await expect(box.getByRole('button', { name: '...more' })).toBeVisible({ timeout: 90_000 })
  // on the counts, clear of the links further down
  await box.click({ position: { x: 20, y: 10 } })
  await expect(box.getByRole('button', { name: 'Show less' })).toBeVisible()
  return box
}

const sections = (box: ReturnType<Page['locator']>) =>
  box.locator(':scope > section').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))

test('ends a music video\'s description with its song and its channel, the transcript between them', async ({ page }) => {
  test.setTimeout(240_000)
  const box = await expand(page, 'dQw4w9WgXcQ')

  const music = box.locator('section[aria-label="Music"]')
  await expect(music.getByRole('heading', { name: 'Music' })).toBeVisible()
  await expect(music.locator('.music-count')).toHaveText('1 song')
  const song = music.locator('.song')
  await expect(song.locator('.song-title')).toHaveText('Never Gonna Give You Up (7" Mix)')
  await expect(song.locator('.song-line')).toHaveText(['Rick Astley', 'Whenever You Need Somebody'])
  await expect(song.locator('img')).toHaveAttribute('src', /^https:\/\/yt3\.googleusercontent\.com\//)
  await expect(music.getByRole('link', { name: 'Music', exact: true })).toHaveAttribute('href', '/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ')

  const card = box.locator('section[aria-label="Channel"]')
  const head = card.locator('.channel-head')
  await expect(head).toHaveAttribute('href', '/channel/UCuAXFkgsw1L7xaCfnd5JJOw')
  await expect(head.locator('.channel-name')).toHaveText('Rick Astley')
  await expect(head.locator('.channel-subs')).toHaveText(/^[\d.]+[KMB]? subscribers$/)
  await expect(head.locator('img')).toHaveAttribute('src', /^https:\/\/yt3\.ggpht\.com\//)
  await expect(card.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/channel/UCuAXFkgsw1L7xaCfnd5JJOw/videos')
  await expect(card.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/channel/UCuAXFkgsw1L7xaCfnd5JJOw/about')
  // the channel's own links go straight to their sites, never through youtube.com's redirect page
  const own = await card.locator('a[target="_blank"]').evaluateAll(links => links.map(link => link.getAttribute('href')))
  expect(own.length).toBeGreaterThan(0)
  for (const href of own) expect(href).toMatch(/^https?:\/\/(?!www\.youtube\.com\/redirect)/)

  expect(await sections(box)).toEqual(['Music', 'Transcript', 'Channel'])

  await card.getByRole('link', { name: 'About' }).click()
  await expect(page).toHaveURL('/channel/UCuAXFkgsw1L7xaCfnd5JJOw?tab=ABOUT')
  await expect(page.getByRole('dialog', { name: 'Rick Astley' }).getByRole('heading', { name: 'Links' })).toBeVisible({ timeout: 120_000 })
})

test('ends a video without music with its chapters, the transcript and its channel', async ({ page }) => {
  test.setTimeout(240_000)
  const box = await expand(page, 'g6Die8gVFn0')
  const card = box.locator('section[aria-label="Channel"]')
  await expect(card.locator('.channel-name')).toHaveText('Marques Brownlee')
  await expect(card.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/channel/UCBJycsmduvYEL83R_U4JriQ/videos')
  expect(await sections(box)).toEqual(['Chapters', 'Transcript', 'Channel'])
})

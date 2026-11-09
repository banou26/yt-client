import type { Page } from '@playwright/test'

import { PLAYBACK_REFUSED } from '../../src/frame/protocol'
import { expect, test } from './test'

/* What youtube.com shows for a video it refuses or no longer has, against the live source, as checked on youtube.com
   on 2026-11-10: CNbsMah32Ss is a members-only Linus Tech Tips video, aaaaaaaaaaa names no video, HtVdAasjOgU is an
   age-restricted trailer and s7_qI6_mIXc a private video. */

type Counted = { openPlaybackCalls: number }

// the app asks the engine over a MessagePort, `{ id, method, args }`, and every retry asks openPlayback again
const countOpenPlayback = () => {
  if (window.top !== window) return
  const counted = window as unknown as Counted
  counted.openPlaybackCalls = 0
  const post = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'postMessage')!.value as (this: MessagePort, message: unknown, ...rest: unknown[]) => void
  MessagePort.prototype.postMessage = function (this: MessagePort, message: unknown, ...rest: unknown[]) {
    if ((message as { method?: string } | null)?.method === 'openPlayback') counted.openPlaybackCalls += 1
    return post.call(this, message, ...rest)
  } as typeof MessagePort.prototype.postMessage
}

// answers every openPlayback with the bot check's refusal, which a new identity can clear, instead of asking the frame
const refuseOpenPlayback = (reply: string) => {
  if (window.top !== window) return
  const counted = window as unknown as Counted
  counted.openPlaybackCalls = 0
  const post = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'postMessage')!.value as (this: MessagePort, message: unknown, ...rest: unknown[]) => void
  MessagePort.prototype.postMessage = function (this: MessagePort, message: unknown, ...rest: unknown[]) {
    const request = message as { id?: number, method?: string } | null
    if (request?.method !== 'openPlayback') return post.call(this, message, ...rest)
    counted.openPlaybackCalls += 1
    setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { id: request.id, error: reply } })), 0)
  } as typeof MessagePort.prototype.postMessage
}

const openPlaybackCalls = (page: Page) => page.evaluate(() => (window as unknown as Counted).openPlaybackCalls)

// a retry starts a second or more after the refusal, so this is long enough for one to have begun
const RETRY_WINDOW_MS = 6_000

const refusal = (page: Page) => page.locator('[data-player-root] [data-refusal]')

const expectNoRawError = async (page: Page) => {
  await expect(page.locator('body')).not.toContainText('Playback failed')
  await expect(page.locator('body')).not.toContainText('Comments are turned off')
  await expect(page.locator('main')).not.toContainText('N/A')
  for (const player of await page.locator('[data-player-root]').all()) await expect(player).not.toContainText('youtube:')
}

test('a members-only video shows youtube.com\'s panel and badge, without retrying', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(countOpenPlayback)
  await page.goto('/watch?v=CNbsMah32Ss')
  const panel = refusal(page)
  await expect(panel.locator('.refusal-title')).toHaveText('Members-only content', { timeout: 120_000 })
  await expect(panel.locator('.refusal-title')).toHaveCSS('color', 'rgb(238, 238, 238)')
  await expect(panel.locator('.refusal-text')).toContainText('This video is available to this channel\'s members')
  await expect(panel.locator('img.refusal-avatar')).toBeVisible()
  await expect(panel.locator('img.refusal-backdrop')).toHaveAttribute('src', /CNbsMah32Ss/)

  await expect(page.locator('main .members-only')).toHaveText('Members only', { timeout: 60_000 })
  const counts = page.locator('main div:has(> .snippet) .counts')
  await expect(counts).toHaveText(/ago$/)
  await expect(counts).not.toContainText('N/A')
  await page.waitForTimeout(RETRY_WINDOW_MS)
  await expectNoRawError(page)
  expect(await openPlaybackCalls(page)).toBe(1)
})

test('a members-only Short shows youtube.com\'s title, without retrying', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(countOpenPlayback)
  await page.goto('/shorts/CNbsMah32Ss')
  await expect(page.locator('main .status')).toHaveText('Members-only content', { timeout: 120_000 })
  await page.waitForTimeout(RETRY_WINDOW_MS)
  await expect(page.locator('main')).not.toContainText('youtube:')
  expect(await openPlaybackCalls(page)).toBe(1)
})

test('a refusal a new identity can clear is asked again, then shown and logged', async ({ page }) => {
  test.setTimeout(240_000)
  const title = 'Sign in to confirm you’re not a bot'
  const reply = `${PLAYBACK_REFUSED}${JSON.stringify({ title, description: 'This helps protect our community. Learn more', signIn: true, final: false })}`
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.addInitScript(refuseOpenPlayback, reply)
  await page.goto('/watch?v=dQw4w9WgXcQ')
  await expect(refusal(page).locator('.refusal-title')).toHaveText(title, { timeout: 120_000 })
  expect(await openPlaybackCalls(page)).toBe(4)
  await expectNoRawError(page)
  expect(errors.filter((text) => text.includes(PLAYBACK_REFUSED))).toHaveLength(1)
})

test('a video that no longer exists shows youtube.com\'s page in place of the player', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/watch?v=aaaaaaaaaaa')
  const heading = page.getByRole('heading', { name: 'This video isn\'t available anymore' })
  await expect(heading).toBeVisible({ timeout: 120_000 })
  // where youtube.com's heading sits, under the picture this page leaves out
  expect(Math.round((await heading.boundingBox())!.y)).toBe(381)
  const home = page.getByRole('link', { name: 'GO TO HOME' })
  await expect(home).toHaveAttribute('href', '/')
  await expect(page.locator('[data-player-root]')).toHaveCount(0)
  await page.waitForTimeout(RETRY_WINDOW_MS)
  await expectNoRawError(page)
  await expect(page.locator('[data-player-root]')).toHaveCount(0)
  await home.click()
  await expect(page).toHaveURL(/\/$/)
})

test('a handle that names no channel shows youtube.com\'s 404 lines', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/@thischanneldoesnotexist9876543')
  await expect(page.locator('main .not-found p')).toHaveText([
    'This page isn\'t available. Sorry about that.',
    'Try searching for something else.',
  ], { timeout: 120_000 })
  await expect(page.locator('main')).not.toContainText('Couldn\'t load this channel')
})

// youtube.com draws the age gate's Sign in large and the private video's at the usual size
for (const { name, id, title, description, signIn } of [
  { name: 'an age-restricted video', id: 'HtVdAasjOgU', title: 'Sign in to confirm your age', description: 'This video may be inappropriate for some users.', signIn: { height: '48px', fontSize: '18px' } },
  { name: 'a private video', id: 's7_qI6_mIXc', title: 'Private video', description: 'If the owner of this video has granted you access, please sign in.', signIn: { height: '40px', fontSize: '14px' } },
]) {
  test(`${name} shows youtube.com's notice with Sign in, without retrying`, async ({ page }) => {
    test.setTimeout(240_000)
    await page.addInitScript(countOpenPlayback)
    await page.goto(`/watch?v=${id}`)
    const panel = refusal(page)
    await expect(panel.locator('.refusal-title')).toHaveText(title, { timeout: 120_000 })
    await expect(panel.locator('.refusal-title')).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(panel.locator('.refusal-text')).toHaveText(description)
    const button = panel.getByRole('button', { name: 'Sign in' })
    await expect(button).toBeVisible()
    await expect(button).toHaveCSS('height', signIn.height)
    await expect(button).toHaveCSS('font-size', signIn.fontSize)
    await page.waitForTimeout(RETRY_WINDOW_MS)
    await expectNoRawError(page)
    expect(await openPlaybackCalls(page)).toBe(1)
  })
}

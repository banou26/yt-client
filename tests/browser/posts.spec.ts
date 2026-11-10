import type { Page } from '@playwright/test'

import { expect, test } from './test'

/* youtube.com's Posts tab, signed out (measured 2026-11-10): a post longer than four lines is cut there with a Read
   more that opens it in place, and its date and its footer's comment count link to /post/<id>, which shows the post
   and then its comments, sorted as on a watch page, under a comment prompt that asks to sign in. */

test('opens a post from the Posts tab by its comment count, on the post and then its comments', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/@mkbhd/posts')
  const posts = page.locator('main article.post')
  const link = posts.first().getByRole('link', { name: /^[\d.,]+[KMB]? comments$/ })
  await expect(link).toHaveAttribute('href', /^\/post\/[\w-]+$/, { timeout: 120_000 })

  // held by position: a filter on its Read more would stop matching once that turns into Show less
  await expect(posts.getByRole('button', { name: 'Read more' }).first()).toBeVisible()
  const longIndex = await posts.evaluateAll(elements => elements.findIndex(element => element.querySelector('.read-more')))
  const long = posts.nth(longIndex)
  const height = () => long.locator('.post-text').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }))
  const clamped = await height()
  expect(clamped.height).toBeLessThanOrEqual(clamped.lineHeight * 4 + 1)
  await long.getByRole('button', { name: 'Read more' }).click()
  await expect(long.getByRole('button', { name: 'Show less' })).toBeVisible()
  expect((await height()).height).toBeGreaterThan(clamped.lineHeight * 4 + 1)

  const href = await link.getAttribute('href')
  await expect(posts.first().locator('.post-date')).toHaveAttribute('href', href!)
  await link.click()
  await expect(page).toHaveURL(href!)
  await expect(page.locator('main article.post')).toBeVisible({ timeout: 120_000 })
  const comments = page.locator('main section').filter({ has: page.locator('.heading') })
  await expect(comments.locator('.heading')).toHaveText(/^\d{1,3}(,\d{3})* Comments?$/, { timeout: 120_000 })
  await expect(comments.locator('.comment').first()).toBeVisible()
  await expect(comments.getByRole('button', { name: 'Sign in to comment' })).toBeVisible()

  const top = await comments.locator('.comment').first().textContent()
  await comments.getByRole('button', { name: 'Sort by' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Newest first' }).click()
  await expect(comments.locator('.comment').first()).not.toHaveText(top!, { timeout: 120_000 })
})

const HARNESS = '/tests/browser/fixtures/posts-harness.tsx'

const openHarness = async (page: Page) => {
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 90_000 })
}

// youtube.com sends a topic channel's posts with no Read more, cut at four lines, each opening its own page
test('cuts a post in a topic channel\'s Home row at four lines with no Read more, its date opening the post', async ({ page }) => {
  test.setTimeout(180_000)
  await openHarness(page)
  const post = page.locator('[data-posts-harness="topic-home"] article.post')
  // the harness's first import can add a dependency for the dev server to bundle, which reloads the page under it
  await expect(async () => {
    if (await post.count() === 0) {
      await page.evaluate(async (path) => {
        const harness = await import(path) as { mountTopicHome: () => Promise<void> }
        await harness.mountTopicHome()
        await document.fonts.ready
      }, HARNESS)
    }
    await expect(post).toBeVisible({ timeout: 15_000 })
  }).toPass({ timeout: 120_000 })
  await expect(post.getByRole('link', { name: '4 hours ago' })).toHaveAttribute('href', '/post/UgkxVbNyGruvVOBe9ImiED0LNY0l3xRyYgNN')
  const text = await post.locator('.post-text').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    full: element.scrollHeight,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }))
  expect(text.height).toBeLessThanOrEqual(text.lineHeight * 4 + 1)
  expect(text.full, 'the recorded post runs past four lines').toBeGreaterThan(text.lineHeight * 4 + 1)
  await expect(post.getByRole('button', { name: 'Read more' })).toHaveCount(0)
})

test('draws a cut text again without measuring it again when only its parent drew again', async ({ page }) => {
  test.setTimeout(180_000)
  await openHarness(page)
  let observed: { first: number, after: number } | undefined
  await expect(async () => {
    observed = await page.evaluate(async (path) => {
      const harness = await import(path) as { mountReadMore: () => () => void }
      document.querySelector('[data-posts-harness="read-more"]')?.remove()
      let count = 0
      const Native = ResizeObserver
      window.ResizeObserver = class extends Native {
        override observe(target: Element, options?: ResizeObserverOptions) {
          if (target.closest('[data-posts-harness="read-more"]')) count += 1
          super.observe(target, options)
        }
      }
      const drawAgain = harness.mountReadMore()
      const first = count
      drawAgain()
      await new Promise(resolve => setTimeout(resolve, 200))
      window.ResizeObserver = Native
      return { first, after: count }
    }, HARNESS)
  }).toPass({ timeout: 120_000 })
  expect(observed).toEqual({ first: 1, after: 1 })
})

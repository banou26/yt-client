import { expect, test } from './test'

// FKN's own notice shows only once the day's free data is used, so a frame of the same shape stands in for it
test('dismissing FKN\'s notice leaves the box being typed in focused', async ({ page }) => {
  await page.setContent('<input aria-label="Search">')
  const input = page.getByRole('textbox', { name: 'Search' })
  await input.pressSequentially('rick a')
  await page.evaluate(() => new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.title = 'FKN'
    frame.srcdoc = '<button title="Dismiss" onclick="this.remove()"><span aria-hidden="true">x</span></button>'
    frame.addEventListener('load', resolve, { once: true })
    document.body.append(frame)
  }))
  await input.press('s')
  await expect(page.frameLocator('iframe[title="FKN"]').getByRole('button', { name: 'Dismiss' }), 'the notice was not dismissed').toHaveCount(0)
  await expect(input).toHaveValue('rick as')
  await expect(input).toBeFocused()
})

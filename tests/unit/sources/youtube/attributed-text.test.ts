import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { Misc } from 'youtubei.js'

/* Pins this repo's youtubei.js patch to Text.fromAttributed. Search's playlist rows ("title · duration") carry one command
   run over the whole text whose length counts UTF-8 bytes (measured 2026-11-10), so unpatched the run reaches past the
   text: youtubei.js warns "Unable to find matching run for command run" and drops the row's link. */

const onTap = { innertubeCommand: { watchEndpoint: { videoId: 'dQw4w9WgXcQ' } } }

describe('an attributed text', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    'Rick Astley - Everlong (Foo Fighters Cover) · 4:12',
    '好想學 3D？超強軟體免費送上門，放棄的話比賽就結束了喔 | Blender 快速上手 #01 · 12:33',
  ])('links all of "%s" when its command run counts UTF-8 bytes, with no warning', (content) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const text = Misc.Text.fromAttributed({ content, commandRuns: [{ startIndex: 0, length: new TextEncoder().encode(content).length, onTap }] })
    expect(text.toString()).toBe(content)
    expect(text.runs).toHaveLength(1)
    expect(text.endpoint?.payload).toMatchObject({ videoId: 'dQw4w9WgXcQ' })
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps a command run that ends inside the text where it is', () => {
    const text = Misc.Text.fromAttributed({ content: 'Rick Astley · 3:33', commandRuns: [{ startIndex: 0, length: 11, onTap }] })
    expect(text.runs?.map((run) => run.text)).toEqual(['Rick Astley', ' · 3:33'])
    expect(text.endpoint?.payload).toMatchObject({ videoId: 'dQw4w9WgXcQ' })
  })

  it('leaves a command run that starts inside the text and overshoots it to youtubei.js', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const text = Misc.Text.fromAttributed({ content: 'Rick Astley · 3:33', commandRuns: [{ startIndex: 14, length: 10, onTap }] })
    expect(text.runs?.map((run) => run.text)).toEqual(['Rick Astley · 3:33'])
    expect(text.runs?.some((run) => 'endpoint' in run && run.endpoint)).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
  })
})

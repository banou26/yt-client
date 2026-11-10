import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser } from 'youtubei.js'

import { normalizeWatchMeta } from '../../../../src/sources/youtube/normalize'
import fixture from '../../fixtures/description-cards.json'

/* description-cards.json holds youtube.com's signed-out /next answers of 2026-11-10, cut to the card lists and the
   channel card of the expanded description, stripped of tracking and playback fields and with the redirect tokens
   blanked: dQw4w9WgXcQ (one song, whose card opens nothing), g6Die8gVFn0 (chapters and no music) and rYYuswC2PHE
   (chapters, then nine songs cut to two, each card opening the song's own video). */

const metaOf = (next: unknown, id: string) =>
  normalizeWatchMeta({ ...Parser.parseResponse(next as never), contents_memo: new Map() }, id)

describe('the expanded description\'s Music section', () => {
  it('reads its count, each song with its cover, and the channel its Music button opens', () => {
    expect(metaOf(fixture.dQw4w9WgXcQ, 'dQw4w9WgXcQ')?.music).toEqual({
      countText: '1 song',
      songs: [{
        title: 'Never Gonna Give You Up (7" Mix)',
        artist: 'Rick Astley',
        album: 'Whenever You Need Somebody',
        thumbnail: 'https://yt3.googleusercontent.com/eC9DfRcYSk4FE-fvDCJSu_4xsKdVMKxwmFTYFZwP8OqB7R4TKxAjKoR-Kp1lXeRi2WddPFYulSte4eW-',
      }],
      channelId: 'UC-9-kyTW8ZkZNDHQJ6FgpwQ',
    })
  })

  it('reads the songs after the chapters, each with the video its card opens', () => {
    const music = metaOf(fixture.rYYuswC2PHE, 'rYYuswC2PHE')?.music
    expect(music?.countText).toBe('9 songs')
    expect(music?.songs.map(song => [song.title, song.artist, song.album, song.videoId])).toEqual([
      ['One Assassination Under God', 'Marilyn Manson', 'One Assassination Under God - Chapter 1', '_wrY-11KZTM'],
      ['No Funeral Without Applause', 'Marilyn Manson', 'One Assassination Under God - Chapter 1', '7boUHGfuxQk'],
    ])
  })

  it('is absent on a video whose only card list is its chapters', () => {
    expect(metaOf(fixture.g6Die8gVFn0, 'g6Die8gVFn0')?.music).toBeUndefined()
    expect(metaOf({}, 'g6Die8gVFn0')?.music).toBeUndefined()
  })
})

describe('the expanded description\'s channel card', () => {
  it('reads the channel, its Videos and About addresses, and its own links past youtube.com\'s redirect page', () => {
    expect(metaOf(fixture.dQw4w9WgXcQ, 'dQw4w9WgXcQ')?.channelCard).toEqual({
      id: 'UCuAXFkgsw1L7xaCfnd5JJOw',
      name: 'Rick Astley',
      avatar: 'https://yt3.ggpht.com/_ShEGOdg-t5YGJse14Ooq6FYBZqX_QSlhaTNjG06miYusm5lWm1UroLyVxnYtahADfRTVLtuVQ=s88-c-k-c0x00ffffff-no-rj',
      subscriberCountText: '4.56M subscribers',
      videosUrl: '/channel/UCuAXFkgsw1L7xaCfnd5JJOw/videos',
      aboutUrl: '/channel/UCuAXFkgsw1L7xaCfnd5JJOw/about',
      links: [
        { title: 'Instagram', url: 'https://www.instagram.com/officialrickastley/' },
        { title: 'TikTok', url: 'https://www.tiktok.com/@rickastleyofficial' },
        { title: 'Facebook', url: 'https://www.facebook.com/RickAstley/' },
        { title: 'YouTube Music', url: 'https://music.youtube.com/channel/UCwZEU0wAwIyZb4x5G_KJp2w' },
      ],
      cards: [],
    })
  })

  it('keeps a link youtube.com sends straight, and is absent from an answer without the card', () => {
    const card = metaOf(fixture.g6Die8gVFn0, 'g6Die8gVFn0')?.channelCard
    expect(card?.name).toBe('Marques Brownlee')
    expect(card?.links).toEqual([
      { title: 'Twitter', url: 'http://twitter.com/MKBHD' },
      { title: 'Instagram', url: 'http://instagram.com/MKBHD' },
      { title: 'The Studio', url: 'http://youtube.com/c/TheStudio' },
      { title: 'Reddit', url: 'http://reddit.com/r/MKBHD' },
      { title: 'Discord', url: 'http://discord.gg/MKBHD' },
    ])
    expect(metaOf(fixture.rYYuswC2PHE, 'rYYuswC2PHE')?.channelCard).toBeUndefined()
  })
})

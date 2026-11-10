import { describe, expect, it } from 'vite-plus/test'

import { chosen, FILTER_GROUPS, filterSearch, removable, searchFilters, searchParams } from '../../../src/components/search-filters'

const group = (label: string) => FILTER_GROUPS.find(entry => entry.label === label)!

// youtube.com's address bar spells sp= percent-encoded twice: sp=EgIQAQ%253D%253D
const link = (sp: string) => searchParams(`search_query=lofi&sp=${sp}`).toString()

describe('search filters', () => {
  it('has the groups and labels of youtube.com\'s Filters panel signed out, in its order', () => {
    expect(FILTER_GROUPS.map(entry => [entry.label, entry.options.map(option => option.label)])).toEqual([
      ['Type', ['Videos', 'Shorts', 'Channels', 'Playlists', 'Movies']],
      ['Duration', ['Under 3 minutes', '3 - 20 minutes', 'Over 20 minutes']],
      ['Upload date', ['Today', 'This week', 'This month', 'This year']],
      ['Features', ['Live', '4K', 'HD', 'Subtitles/CC', 'Creative Commons', '360°', 'VR180', '3D', 'HDR', 'Location', 'Purchased']],
      ['Prioritize', ['Relevance', 'Popularity']],
    ])
  })

  it('reads every option of youtube.com\'s panel out of the sp= its link carries', () => {
    // the panel's links on a plain search, measured signed out on 2026-11-10
    const measured: [string, string][] = [
      ['EgIQAQ%253D%253D', 'type=VIDEO'],
      ['EgIQCQ%253D%253D', 'type=SHORTS'],
      ['EgIQAg%253D%253D', 'type=CHANNEL'],
      ['EgIQAw%253D%253D', 'type=PLAYLIST'],
      ['EgIQBA%253D%253D', 'type=MOVIE'],
      ['EgIYBA%253D%253D', 'duration=UNDER_THREE_MINS'],
      ['EgIYBQ%253D%253D', 'duration=THREE_TO_TWENTY_MINS'],
      ['EgIYAg%253D%253D', 'duration=OVER_TWENTY_MINS'],
      ['EgIIAg%253D%253D', 'upload_date=TODAY'],
      ['EgIIAw%253D%253D', 'upload_date=WEEK'],
      ['EgIIBA%253D%253D', 'upload_date=MONTH'],
      ['EgIIBQ%253D%253D', 'upload_date=YEAR'],
      ['EgJAAQ%253D%253D', 'features=LIVE'],
      ['EgJwAQ%253D%253D', 'features=FOUR_K'],
      ['EgIgAQ%253D%253D', 'features=HD'],
      ['EgIoAQ%253D%253D', 'features=SUBTITLES'],
      ['EgIwAQ%253D%253D', 'features=CREATIVE_COMMONS'],
      ['EgJ4AQ%253D%253D', 'features=THREE_SIXTY'],
      ['EgPQAQE%253D', 'features=VR180'],
      ['EgI4AQ%253D%253D', 'features=THREE_D'],
      ['EgPIAQE%253D', 'features=HDR'],
      ['EgO4AQE%253D', 'features=LOCATION'],
      ['EgJIAQ%253D%253D', 'features=PURCHASED'],
      ['CAM%253D', 'sort=POPULARITY'],
    ]
    for (const [sp, filter] of measured) expect(link(sp), sp).toBe(`search_query=lofi&${filter}`)
  })

  it('reads a combination youtube.com built, and its link with the filter taken off again', () => {
    expect(link('CAMSCBABGAQgAUAB')).toBe('search_query=lofi&type=VIDEO&duration=UNDER_THREE_MINS&features=LIVE%2CHD&sort=POPULARITY')
    expect(link('CAMSBhgEIAFAAQ%253D%253D')).toBe('search_query=lofi&duration=UNDER_THREE_MINS&features=LIVE%2CHD&sort=POPULARITY')
    expect(link('EgA%253D')).toBe('search_query=lofi')
  })

  it('reads sp= percent-encoded once or not at all, and leaves out what the panel cannot show', () => {
    expect(link('EgIQAw%3D%3D')).toBe('search_query=lofi&type=PLAYLIST')
    expect(link('EgIQAw==')).toBe('search_query=lofi&type=PLAYLIST')
    // youtube.com still sorts by upload date for CAI=, which its panel no longer offers
    expect(link('CAI%253D')).toBe('search_query=lofi')
    expect(link('CAISAhAB')).toBe('search_query=lofi&type=VIDEO')
    for (const junk of ['', 'garbage!!', '%E0%A4%A', '_w8B']) expect(link(junk), junk).toBe('search_query=lofi')
  })

  it('keeps a readable filter over the sp= one, unless no option has its value', () => {
    expect(searchParams('search_query=lofi&type=CHANNEL&sp=EgIQAQ%253D%253D').toString()).toBe('search_query=lofi&type=CHANNEL')
    expect(searchParams('search_query=lofi&type=playlist&sp=EgIQAQ%253D%253D').toString()).toBe('search_query=lofi&type=VIDEO')
  })

  it('keeps yt-client\'s own parameters as they are', () => {
    const own = 'search_query=lofi&upload_date=WEEK&type=VIDEO&duration=OVER_TWENTY_MINS&sort=POPULARITY&features=LIVE%2CHD&unwatched=1'
    expect(searchParams(own).toString()).toBe(own)
    expect(searchParams('search_query=lofi&features=LIVE,HD').get('features')).toBe('LIVE,HD')
  })

  it('drops an unknown or wrongly cased value instead of asking it', () => {
    expect(searchParams('search_query=lofi+playlist&type=playlist').toString()).toBe('search_query=lofi+playlist')
    expect(searchParams('search_query=lofi&duration=long&upload_date=week&sort=views&type=ALL').toString()).toBe('search_query=lofi')
    expect(searchParams('search_query=lofi&features=hd,LIVE,NOPE,LIVE').get('features')).toBe('LIVE')
    expect(searchParams('search_query=lofi&features=hd').has('features')).toBe(false)
  })

  it('asks the API only for values its enums hold', () => {
    expect(searchFilters(searchParams('search_query=lofi&type=playlist&features=hd&sort=views'))).toEqual({
      uploadDate: undefined,
      type: undefined,
      duration: undefined,
      sortBy: undefined,
      features: undefined,
      unwatched: undefined,
    })
    expect(searchFilters(searchParams('search_query=lofi&sp=CAMSCBABGAQgAUAB&unwatched=1'))).toEqual({
      uploadDate: undefined,
      type: 'VIDEO',
      duration: 'UNDER_THREE_MINS',
      sortBy: 'POPULARITY',
      features: ['LIVE', 'HD'],
      unwatched: true,
    })
  })

  it('swaps a group\'s value, adds a feature to the others, and takes a chosen one off', () => {
    const from = searchParams('search_query=lofi&type=VIDEO&features=LIVE')
    expect(filterSearch(from, group('Type'), 'SHORTS')).toBe('search_query=lofi&type=SHORTS&features=LIVE')
    expect(filterSearch(from, group('Type'), 'VIDEO')).toBe('search_query=lofi&features=LIVE')
    expect(filterSearch(from, group('Features'), 'HD')).toBe('search_query=lofi&type=VIDEO&features=LIVE%2CHD')
    expect(filterSearch(from, group('Features'), 'LIVE')).toBe('search_query=lofi&type=VIDEO')
    expect(removable(group('Type'))).toBe(true)
    expect(removable(group('Features'))).toBe(true)
  })

  it('holds Relevance until Popularity is picked, and only picking Relevance leaves Popularity', () => {
    const plain = searchParams('search_query=lofi')
    expect(chosen(plain, group('Prioritize'))).toEqual(['RELEVANCE'])
    expect(removable(group('Prioritize'))).toBe(false)
    const popular = filterSearch(plain, group('Prioritize'), 'POPULARITY')
    expect(popular).toBe('search_query=lofi&sort=POPULARITY')
    expect(chosen(searchParams(popular), group('Prioritize'))).toEqual(['POPULARITY'])
    expect(filterSearch(searchParams(popular), group('Prioritize'), 'RELEVANCE')).toBe('search_query=lofi')
  })

  it('writes a filter picked on a youtube.com link as readable parameters and drops the sp=', () => {
    const pasted = searchParams('search_query=lofi&sp=EgIQAw%253D%253D')
    expect(chosen(pasted, group('Type'))).toEqual(['PLAYLIST'])
    expect(filterSearch(pasted, group('Prioritize'), 'POPULARITY')).toBe('search_query=lofi&type=PLAYLIST&sort=POPULARITY')
  })
})

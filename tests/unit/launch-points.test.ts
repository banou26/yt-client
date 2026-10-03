/// <reference types="vite/client" />
import { describe, expect, it } from 'vite-plus/test'

// Read as raw text through vite, since vite.config.ts shims node:fs to an empty module under vp test.
// vite leaves the importing file out of its own glob, so this file's fixtures never scan as launches.
const tree = import.meta.glob(
  ['../../*.config.{ts,mts,cts,js,mjs,cjs}', '../../{tests,scripts}/**/*.{ts,mts,cts,tsx,js,mjs,cjs}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

type Launch = { kind: 'chromium' | 'firefox', at: string, muted: boolean }

const CLOSE: Record<string, string> = { '(': ')', '{': '}', '[': ']' }

// a slash opens a regex where a value is expected: at the start, or after an operator, an opening bracket or a keyword
const VALUE_EXPECTED = /(?:[=(,:[!&|?{};+\-*%<>~^]|(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await))$/

const opensRegex = (out: string) => {
  let end = out.length
  while (end > 0 && /\s/.test(out[end - 1]!)) end--
  return end === 0 || VALUE_EXPECTED.test(out.slice(Math.max(0, end - 8), end))
}

// A regex literal's end: the next unescaped slash outside a character class, on the same line, since a
// regex cannot span one. A slash that has none was a division after all.
const regexEnd = (source: string, start: number) => {
  let inClass = false
  for (let j = start + 1; j < source.length && source[j] !== '\n'; j++) {
    if (source[j] === '\\') j++
    else if (source[j] === '[') inClass = true
    else if (source[j] === ']') inClass = false
    else if (source[j] === '/' && !inClass) return j
  }
  return -1
}

// Blanks comments and regex literals, and string contents too when asked, keeping every offset and the
// delimiters. Structure is read with strings blanked as well, so a launch named in a comment or a
// string, or a bracket or quote inside a regex, is not code; the markers, which are strings, are read
// with only the comments and regexes blanked.
const blank = (source: string, strings: boolean) => {
  let out = ''
  for (let i = 0; i < source.length;) {
    const char = source[i]!
    if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i)
      const stop = end < 0 ? source.length : end
      out += ' '.repeat(stop - i)
      i = stop
    } else if (source.startsWith('/*', i)) {
      const stop = source.indexOf('*/', i + 2) + 2 || source.length
      out += source.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
    } else if (char === "'" || char === '"' || char === '`') {
      let j = i + 1
      while (j < source.length && source[j] !== char) j += source[j] === '\\' ? 2 : 1
      const body = source.slice(i + 1, j)
      out += char + (strings ? body.replace(/[^\n]/g, ' ') : body) + char
      i = j + 1
    } else if (char === '/' && opensRegex(out) && regexEnd(source, i) > 0) {
      const end = regexEnd(source, i)
      out += '/' + ' '.repeat(end - i - 1) + '/'
      i = end + 1
    } else {
      out += char
      i++
    }
  }
  return out
}

const balanced = (text: string, open: number) => {
  const stack = [CLOSE[text[open]!]]
  for (let i = open + 1; i < text.length; i++) {
    const char = text[i]!
    if (CLOSE[char]) stack.push(CLOSE[char])
    else if (char === stack[stack.length - 1]) stack.pop()
    if (!stack.length) return i + 1
  }
  return text.length
}

const CALL = /\b(chromium|firefox)\.(?:launch|launchPersistentContext|launchServer)\s*\(|(?<!\.)\blaunchPersistentContext\s*\(|\blaunchOptions\s*:\s*\{/g
const GECKO = /(["'])moz:firefoxOptions\1\s*:\s*\{/g

const launches = (file: string, source: string): Launch[] => {
  const structure = blank(source, true)
  const marks = blank(source, false)
  const opened = [
    ...[...structure.matchAll(CALL)].map(match => ({ index: match.index, open: match.index + match[0].length - 1, firefox: match[1] === 'firefox' })),
    // a geckodriver capability key is a string, so it is found with strings kept and kept only where it is code
    ...[...marks.matchAll(GECKO)].filter(match => structure[match.index] === match[1])
      .map(match => ({ index: match.index, open: match.index + match[0].length - 1, firefox: true })),
  ]
  return opened.map(({ index, open, firefox }) => {
    const close = balanced(structure, open)
    const options = structure.slice(open, close)
    const kind = firefox || /\bfirefoxUserPrefs\s*:/.test(options) ? 'firefox' : 'chromium'
    // Every args array of a Chromium launch carries the flag, so a spread branch that replaces args
    // cannot drop it unseen; every prefs object of a Firefox one sets the scale to 0.0.
    const holder = kind === 'chromium' ? /\bargs\s*:\s*\[/g : /\b(?:prefs|firefoxUserPrefs)\s*:\s*\{/g
    const mark = kind === 'chromium' ? /(["'])--mute-audio\1/ : /(["'])media\.volume_scale\1\s*:\s*(["'])0\.0\2/
    const held = [...options.matchAll(holder)].map(match => {
      const at = open + match.index + match[0].length - 1
      return marks.slice(at, balanced(structure, at))
    })
    return {
      kind,
      at: `${file}:${source.slice(0, index).split('\n').length}`,
      muted: held.length > 0 && held.every(span => mark.test(span)),
    }
  })
}

describe('the launch scan', () => {
  const scan = (source: string) => launches('fixture.ts', source).map(({ kind, muted }) => ({ kind, muted }))

  it('reports an unmuted launch of each shape, and passes the muted ones (control)', () => {
    expect(scan(`chromium.launch({ headless: true })`)).toEqual([{ kind: 'chromium', muted: false }])
    expect(scan(`chromium.launch()`)).toEqual([{ kind: 'chromium', muted: false }])
    expect(scan(`chromium.launch({ args: ['--mute-audio'] })`)).toEqual([{ kind: 'chromium', muted: true }])
    expect(scan(`await chromium.launchPersistentContext('', { args: ['--autoplay-policy=no-user-gesture-required'] })`))
      .toEqual([{ kind: 'chromium', muted: false }])
    expect(scan(`use: { launchOptions: { args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] } }`))
      .toEqual([{ kind: 'chromium', muted: true }])
    expect(scan(`provider: playwright({ launchOptions: { executablePath } })`)).toEqual([{ kind: 'chromium', muted: false }])
    expect(scan(`firefox.launch({ firefoxUserPrefs: { 'media.volume_scale': '0.0' } })`)).toEqual([{ kind: 'firefox', muted: true }])
    expect(scan(`launchOptions: { firefoxUserPrefs: { 'media.autoplay.default': 0 } }`)).toEqual([{ kind: 'firefox', muted: false }])
    expect(scan(`'moz:firefoxOptions': { args: ['-headless'], prefs: { 'media.autoplay.default': 0 } }`))
      .toEqual([{ kind: 'firefox', muted: false }])
    expect(scan(`'moz:firefoxOptions': { args: ['-headless'], prefs: { 'media.volume_scale': '0.0' } }`))
      .toEqual([{ kind: 'firefox', muted: true }])
  })

  it('reports a spread branch whose args replace the muted ones (control)', () => {
    const spread = `chromium.launch({
      args: ['--mute-audio'],
      ...(extension ? { ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] } : {}),
    })`
    expect(scan(spread)).toEqual([{ kind: 'chromium', muted: false }])
  })

  it('ignores a launch named in a comment or a string, and a mute named only in a comment (control)', () => {
    expect(scan(`// chromium.launch({ headless: true })\nconst note = 'chromium.launch()'`)).toEqual([])
    expect(scan(`const doc = "'moz:firefoxOptions': { prefs: {} }"`)).toEqual([])
    expect(scan(`chromium.launch({ args: [/* '--mute-audio' */ '--headless=new'] })`)).toEqual([{ kind: 'chromium', muted: false }])
  })

  it('reads past a regex literal holding a quote, and tells a division from one (control)', () => {
    const unmuted = [{ kind: 'chromium', muted: false }]
    const launch = `\nchromium.launch({ args: ['--headless=new'] })`
    expect(scan(`const quoteInRegex = /don't/${launch}`)).toEqual(unmuted)
    expect(scan(`const sets = text.match(/mimeType="([^"]+)"/g)${launch}`)).toEqual(unmuted)
    expect(scan(`const separators = /[/'"]/${launch}`)).toEqual(unmuted)
    expect(scan(`const share = used / total, slash = '/', quote = "'"${launch}`)).toEqual(unmuted)
    expect(scan(`const half = count++ / 2, quote = "'"${launch}\nconst ratio = width / height`)).toEqual(unmuted)
    expect(scan(`chromium.launch({ args: [/'--mute-audio'/.source] })`)).toEqual(unmuted)
  })
})

// a scan that loses its place reads code as a string and a string as code, so its brackets stop pairing
const inStep = (source: string) => {
  const stack: string[] = []
  for (const char of blank(source, true)) {
    if (CLOSE[char]) stack.push(CLOSE[char])
    else if (')]}'.includes(char) && stack.pop() !== char) return false
  }
  return !stack.length
}

describe('every browser this repo launches is muted', () => {
  const found = Object.entries(tree).flatMap(([file, source]) => launches(file, source))

  it('reads every file it scans in step, so no launch hides behind a quote it paired wrongly', () => {
    expect(Object.keys(tree), 'the scan missed a root config').toEqual(
      expect.arrayContaining([expect.stringMatching(/vite\.config\.ts$/), expect.stringMatching(/playwright\.config\.ts$/)]),
    )
    expect(Object.entries(tree).filter(([, source]) => !inStep(source)).map(([file]) => file)).toEqual([])
  })

  it('every Chromium launch carries --mute-audio and every Firefox launch, through Playwright or geckodriver capabilities, sets media.volume_scale 0.0', () => {
    expect(found.map(({ at }) => at), 'the scan found none of the known launch points, so it proves nothing').toEqual(
      expect.arrayContaining([
        expect.stringMatching(/playwright\.config\.ts:\d+$/),
        expect.stringMatching(/extension-egress\.spec\.ts:\d+$/),
        expect.stringMatching(/firefox-extension-check\.mjs:\d+$/),
      ]),
    )
    expect(found.filter(launch => !launch.muted).map(({ kind, at }) => `${kind} ${at}`)).toEqual([])
  })
})

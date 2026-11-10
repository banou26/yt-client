type BundleFile = { type: 'asset' } | { type: 'chunk', imports: readonly string[], dynamicImports: readonly string[] }

/**
 * Every file of code a page can import after it started, as paths from the site's root: what its entry chunk reaches
 * once dynamic imports are followed, less what static imports alone reach, which loads with the page. Run at build
 * time over the bundle; `src/warm-code.ts` downloads the result.
 */
export const lazyCode = (bundle: Readonly<Record<string, BundleFile>>, entry: string): string[] => {
  const reach = (dynamic: boolean) => {
    const seen = new Set<string>()
    const visit = (file: string) => {
      const chunk = bundle[file]
      if (seen.has(file) || chunk?.type !== 'chunk') return
      seen.add(file)
      for (const next of dynamic ? [...chunk.imports, ...chunk.dynamicImports] : chunk.imports) visit(next)
    }
    visit(entry)
    return seen
  }
  const atStart = reach(false)
  return [...reach(true)].filter(file => !atStart.has(file)).map(file => `/${file}`)
}

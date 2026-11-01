/**
 * A search suggestion split the way youtube.com prints it: what the reader has
 * already typed in normal weight, the completion in bold. A suggestion that does
 * not start with the typed text is all completion.
 */
export const splitSuggestion = (typed: string, suggestion: string) => {
  const prefix = typed.trimStart().toLowerCase()
  if (prefix.length === 0 || !suggestion.toLowerCase().startsWith(prefix)) {
    return { typed: '', completion: suggestion }
  }
  return { typed: suggestion.slice(0, prefix.length), completion: suggestion.slice(prefix.length) }
}

/** The build a test page names in its `yt-build` tag, and that page's `document.querySelector`. */
export const BUILD = 'this-build'
export const querySelector = (selector: string) => selector === 'meta[name="yt-build"]' ? { content: BUILD } : null

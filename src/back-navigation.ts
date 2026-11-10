let back = false

/* Listening from the first import puts these ahead of wouter's own listeners, which subscribe when the app mounts. A
   popstate the browser fires runs its microtasks after each listener, so the route renders right after wouter's: with
   this listener added after mount, going back to Home read it anew and scrolled to the top (measured 2026-11-10). */
addEventListener('popstate', () => {
  back = true
})
// wouter patches history.pushState and replaceState to dispatch these nonstandard events, the counterparts to popstate
addEventListener('pushState', () => {
  back = false
})
addEventListener('replaceState', () => {
  back = false
})

/** Whether the route on screen was reached with the browser's back or forward button rather than a link or a redirect. */
export const cameBack = () => back

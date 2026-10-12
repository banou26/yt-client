import { GLOBAL_NAME, PROGRAM } from '../engine/agent-fakes'

export const INTERPRETER_URL = '//www.google.com/js/th/interpreter.js'

/**
 * A watch page as youtube.com writes it: the ytcfg first, the player response, then the att/get
 * answer as a single-quoted JS string with its quotes, slashes and equals signs escaped.
 */
export const watchPage = ({ eventId = 'event-1', challenge = true } = {}) => {
  const answer = JSON.stringify({
    bgChallenge: {
      interpreterHash: 'a+b/c=',
      program: PROGRAM,
      globalName: GLOBAL_NAME,
      interpreterUrl: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue: INTERPRETER_URL },
    },
  })
  const literal = answer.replace(/\\/g, '\\\\').replace(/"/g, '\\x22').replace(/\//g, '\\/').replace(/=/g, '\\u003d')
  return `<!DOCTYPE html><html><head><script>ytcfg.set({"EVENT_ID":"${eventId}","INNERTUBE_CONTEXT_CLIENT_VERSION":"2.20261008.00.00"});</script>`
    + '<script>ytcfg.set({"LATER":true});</script></head><body>'
    + '<script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"video-1","title":"a {brace} and a \\"quote\\""}};</script>'
    + (challenge ? `<script>window.ytAtN({'R': '${literal}'});</script>` : '')
    + '</body></html>'
}

/** A response whose body arrives in the chunks given, as a streamed page does. */
export const streamed = (chunks: string[]) => new Response(new ReadableStream({
  start: (controller) => {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
    controller.close()
  },
}))

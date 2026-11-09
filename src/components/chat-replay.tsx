import type { ChatReplayView, LiveChatReplayQuery } from '../generated/graphql'

import { css } from '@emotion/react'
import { ChevronDown, MessagesSquare, X } from 'lucide-react'
import { useEffect, useState } from 'preact/hooks'
import { useClient } from 'urql'

import { gql } from '../generated'
import { playheadAt } from '../player/seek'
import { ChatLine, chatStyles, TRANSCRIPT_LIMIT, usePinnedLog } from './live-chat'
import { Menu, MenuItem } from './ui/menu'

type ReplayLine = LiveChatReplayQuery['liveChatReplay']['items'][number]

const LIVE_CHAT_REPLAY_QUERY = gql(`
  query LiveChatReplay($videoId: ID!, $offsetMs: Int!, $view: ChatReplayView, $cursor: String) {
    liveChatReplay(videoId: $videoId, offsetMs: $offsetMs, view: $view, cursor: $cursor) {
      items {
        id
        text
        runs { text url videoId startSeconds browseId emojiUrl emojiLabel }
        timestampText
        isOwner
        isModerator
        isMember
        purchaseAmountText
        headerBackgroundColor
        bodyBackgroundColor
        author { id name avatar handle }
        offsetMs
      }
      cursor
      disabled
    }
  }
`)

const VIEWS: { value: ChatReplayView, label: string }[] = [
  { value: 'TOP', label: 'Top chat replay' },
  { value: 'ALL', label: 'Live chat replay' },
]

// every replay page upstream sends says timeUntilLastMessageMsec 5000, and youtube.com asks for the next one once the
// playhead is that close to the last line it holds (measured on fOT0BUpITw8, 2026-11-10)
const LEAD_MS = 5_000
const TICK_MS = 250
// a step outside these between two ticks is a seek, which youtube.com answers by starting the replay over at the new
// point; playing at 2x moves 500 ms a tick, and a busy main thread stretches that
const SEEK_BACK_MS = 1_000
const SEEK_AHEAD_MS = 3_000
const RETRY_MS = 2_000

const panelStyle = css`
  .head {
    padding: 0.4rem 0.4rem 0.4rem 0.8rem;
  }

  .view,
  .close {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border: none;
    background: none;
    color: var(--text-primary);
    font: inherit;
    cursor: pointer;
    border-radius: 1.8rem;
  }

  .view {
    padding: 0.6rem 0.8rem;
    font-size: 1.6rem;
    font-weight: 400;
  }

  .close {
    padding: 0.8rem;
    margin-left: auto;
  }

  .view:hover,
  .close:hover {
    background: var(--bg-hover);
  }
`

const teaserStyle = css`
  margin-top: 1.2rem;
  padding: 1.2rem;
  border-radius: 1.2rem;
  background: var(--bg-hover);
  color: var(--text-primary);

  h2 {
    margin: 0 0 0.8rem;
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 2rem;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.2rem;
  }

  button {
    border: none;
    border-radius: 1.8rem;
    padding: 0.6rem 1.2rem;
    background: var(--bg-hover-strong);
    color: var(--text-primary);
    font: inherit;
    font-size: 1.2rem;
    font-weight: 500;
    cursor: pointer;
  }

  button:disabled {
    color: var(--text-secondary);
    cursor: default;
  }
`

/** youtube.com's closed state: the card beside the description that opens the panel, and is greyed while it is open. */
export const ChatReplayTeaser = ({ open, onOpen }: { open: boolean, onOpen: () => void }) => (
  <section css={teaserStyle} aria-label='Live chat replay'>
    <h2>Live chat replay</h2>
    <div className='row'>
      <MessagesSquare size={24} strokeWidth={1.5} aria-hidden='true' />
      <button type='button' disabled={open} onClick={onOpen}>Open panel</button>
    </div>
  </section>
)

/**
 * The chat of a finished stream or premiere, shown in step with the playhead the way youtube.com's replay is: lines
 * appear once the video reaches the point they were said at, and a seek either way clears the log and starts it over
 * from the new point.
 */
export const ChatReplay = ({ videoId, onClose }: { videoId: string, onClose: () => void }) => {
  const client = useClient()
  const [view, setView] = useState<ChatReplayView>('TOP')
  const [messages, setMessages] = useState<ReplayLine[]>([])
  const { logRef, onScroll, pinned, setPinned } = usePinnedLog(messages)

  useEffect(() => {
    let shown: ReplayLine[] = []
    let pending: ReplayLine[] = []
    let cursor: string | undefined
    let reach = 0
    let ended = false
    let asking = false
    let waitUntil = 0
    let run = 0
    let last: number | undefined

    const show = (lines: ReplayLine[]) => {
      shown = lines.length > TRANSCRIPT_LIMIT ? lines.slice(lines.length - TRANSCRIPT_LIMIT) : lines
      setMessages(shown)
    }

    const ask = async (at: number) => {
      asking = true
      const started = run
      const result = await client
        .query(LIVE_CHAT_REPLAY_QUERY, { videoId, offsetMs: Math.round(at), view, cursor }, { requestPolicy: 'network-only' })
        .toPromise()
      if (started !== run) return
      asking = false
      const page = result.data?.liveChatReplay
      if (!page) {
        // a cursor an engine reset dropped is unknown to the next engine, so the replay picks up again at the playhead
        cursor = undefined
        waitUntil = Date.now() + RETRY_MS
        return
      }
      const known = new Set([...shown, ...pending].map((line) => line.id))
      const fresh = page.items.filter((line) => !known.has(line.id))
      pending = [...pending, ...fresh].sort((a, b) => (a.offsetMs ?? 0) - (b.offsetMs ?? 0))
      reach = Math.max(reach, ...page.items.map((line) => line.offsetMs ?? 0))
      cursor = page.cursor ?? undefined
      ended = cursor === undefined
      if (fresh.length === 0) waitUntil = Date.now() + RETRY_MS
    }

    const restart = () => {
      run += 1
      pending = []
      cursor = undefined
      reach = 0
      ended = false
      asking = false
      waitUntil = 0
      show([])
      setPinned(true)
    }

    const tick = () => {
      const seconds = playheadAt(videoId)
      if (seconds === undefined) return
      const at = seconds * 1_000
      if (last !== undefined && (at < last - SEEK_BACK_MS || at > last + SEEK_AHEAD_MS)) restart()
      last = at
      const due = pending.findIndex((line) => (line.offsetMs ?? 0) > at)
      const ready = due === -1 ? pending : pending.slice(0, due)
      if (ready.length > 0) {
        pending = pending.slice(ready.length)
        show([...shown, ...ready])
      }
      if (asking || ended || Date.now() < waitUntil) return
      if (cursor === undefined || reach - at < LEAD_MS) void ask(at)
    }

    show([])
    tick()
    const timer = setInterval(tick, TICK_MS)
    return () => {
      clearInterval(timer)
      run += 1
    }
  }, [client, videoId, view])

  const current = VIEWS.find((option) => option.value === view)!
  return (
    <section css={[chatStyles, panelStyle]} className='chat-replay' aria-label='Chat replay'>
      <div className='head'>
        <Menu
          label='Chat replay view'
          align='start'
          trigger={
            <button type='button' className='view'>
              {current.label}
              <ChevronDown size={20} strokeWidth={1.5} />
            </button>
          }
        >
          {VIEWS.map((option) => (
            <MenuItem
              key={option.value}
              label={option.label}
              checked={option.value === view}
              closeOnSelect
              onSelect={() => setView(option.value)}
            />
          ))}
        </Menu>
        <button type='button' className='close' aria-label='Close' onClick={onClose}>
          <X size={24} strokeWidth={1.5} />
        </button>
      </div>
      <div className='log' ref={logRef} onScroll={onScroll}>
        {messages.map((message) => <ChatLine key={message.id} message={message} />)}
      </div>
      {!pinned && messages.length > 0
        ? <button type='button' className='resume' onClick={() => setPinned(true)}>Jump to latest</button>
        : undefined}
    </section>
  )
}

export default ChatReplay

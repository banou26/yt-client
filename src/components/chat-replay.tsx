import type { ChatReplayView, LiveChatReplayQuery } from '../generated/graphql'

import { css } from '@emotion/react'
import { ChevronDown, MessagesSquare, X } from 'lucide-react'
import { useEffect, useState } from 'preact/hooks'
import { useClient } from 'urql'

import { gql } from '../generated'
import { playheadAt } from '../player/seek'
import { followChatReplay } from './chat-replay-follow'
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

  useEffect(() => followChatReplay({
    playhead: () => playheadAt(videoId),
    fetchPage: async (offsetMs, cursor) => {
      const result = await client
        .query(LIVE_CHAT_REPLAY_QUERY, { videoId, offsetMs, view, cursor }, { requestPolicy: 'network-only' })
        .toPromise()
      return result.data?.liveChatReplay
    },
    show: setMessages,
    onRestart: () => setPinned(true),
    limit: TRANSCRIPT_LIMIT,
  }), [client, videoId, view])

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

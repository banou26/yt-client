import { css } from '@emotion/react'

import { Dialog } from '../components/ui/dialog'

const SECTIONS: { title: string, rows: [string, string][] }[] = [
  {
    title: 'Playback',
    rows: [
      ['Toggle play/pause', 'k'],
      ['Rewind 10 seconds', 'j'],
      ['Fast forward 10 seconds', 'l'],
      ['Previous frame (while paused)', ','],
      ['Next frame (while paused)', '.'],
      ['Decrease playback rate', '<'],
      ['Increase playback rate', '>'],
      ['Seek to a point in the video', '0 to 9'],
      ['Seek to previous chapter', 'Ctrl+←'],
      ['Seek to next chapter', 'Ctrl+→'],
      ['Seek backward 5 seconds', '←'],
      ['Seek forward 5 seconds', '→'],
      ['Increase volume 5%', '↑'],
      ['Decrease volume 5%', '↓'],
      ['Toggle mute', 'm'],
      ['Previous video', 'Shift+P'],
      ['Next video', 'Shift+N'],
    ],
  },
  {
    title: 'General',
    rows: [
      ['Toggle full screen', 'f'],
      ['Toggle theater mode', 't'],
      ['Toggle miniplayer', 'i'],
      ['Go to search box', '/'],
      ['Show keyboard shortcuts', 'Shift+?'],
    ],
  },
  {
    title: 'Subtitles and closed captions',
    rows: [['Toggle subtitles', 'c']],
  },
]

const style = css`
  .section + .section {
    margin-top: 2.4rem;
  }

  .section-title {
    margin: 0 0 0.8rem;
    font-size: 1.6rem;
    font-weight: 500;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.6rem;
    padding: 0.6rem 0;
    font-size: 1.4rem;
  }

  kbd {
    flex: none;
    font: inherit;
    font-weight: 500;
  }
`

export const ShortcutsDialog = ({ onClose }: { onClose: () => void }) => (
  <Dialog title='Keyboard shortcuts' onClose={onClose}>
    <div css={style}>
      {SECTIONS.map(section => (
        <section className='section' key={section.title}>
          <h3 className='section-title'>{section.title}</h3>
          {section.rows.map(([label, key]) => (
            <div className='row' key={label}>
              <span>{label}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </section>
      ))}
    </div>
  </Dialog>
)

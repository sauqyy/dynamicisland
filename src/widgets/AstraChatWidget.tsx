import { useEffect, useRef, useState } from 'react'
import { play } from 'cuelume'
import { Mascot } from '../mascot/Mascot'
import { ChatInput } from './ChatInput'
import type { useAssistant } from '../lib/useAssistant'
import type { AccessoryColors, MascotAccessory } from '../lib/settings'

interface Props {
  chat: ReturnType<typeof useAssistant>['chat']
  name: string
  color: string
  accessories: MascotAccessory[]
  accessoryColors: AccessoryColors
  /** the "speak answers aloud" setting; the chat can read its answers out when this is on */
  voiceOn: boolean
}

const HINTS = ['What can you do?', 'Open Spotify', 'Set a 10 minute timer', 'Tell me a joke']

const VOICE_KEY = 'di.astra.chatVoice'
const loadVoice = () => {
  try {
    return localStorage.getItem(VOICE_KEY) === '1'
  } catch {
    return false
  }
}

/** Text chat with the assistant: the same brain, memory and actions as talking, written instead of spoken. */
export function AstraChatWidget({ chat, name, color, accessories, accessoryColors, voiceOn }: Props) {
  const [draft, setDraft] = useState('')
  const [speakIt, setSpeakIt] = useState(loadVoice)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [chat.messages.length, chat.busy])

  const send = (text: string) => {
    if (!text.trim() || chat.busy) return
    play('tap', { emphasis: 'subtle' })
    void chat.send(text, { speak: speakIt && voiceOn })
    setDraft('')
  }

  return (
    <div className="chat astra-chat">
      <div className="chat-head">
        <Mascot state={chat.busy ? 'thinking' : 'idle'} size={28} color={color} accessories={accessories} accessoryColors={accessoryColors} />
        <div className="astra-who">
          <b>{name}</b>
          <small>{chat.busy ? 'Thinking...' : 'Online'}</small>
        </div>
        <span className="astra-grow" />
        {voiceOn && (
          <button
            className="chip astra-icon-btn"
            aria-pressed={speakIt}
            data-cuelume-toggle
            title={speakIt ? 'Answers are read aloud' : 'Answers are only written'}
            onClick={() => {
              const next = !speakIt
              setSpeakIt(next)
              try {
                localStorage.setItem(VOICE_KEY, next ? '1' : '0')
              } catch {
                /* ignore */
              }
            }}
          >
            {speakIt ? '🔊' : '🔇'}
          </button>
        )}
        {chat.messages.length > 0 && (
          <button className="chip" title="Start a fresh conversation" data-cuelume-tap onClick={chat.clear}>
            New
          </button>
        )}
      </div>
      <div className="chat-list">
        {chat.messages.length === 0 ? (
          <div className="astra-empty">
            <b>How can I help?</b>
            <small>Ask a question, or have me open apps and set timers.</small>
            <div className="astra-hints">
              {HINTS.map((h) => (
                <button key={h} className="chip" data-cuelume-tap onClick={() => send(h)}>
                  {h}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chat.messages.map((m) => (
            <div key={m.id} className={`msg ${m.role === 'user' ? 'mine' : ''} ${m.error ? 'bad' : ''}`}>
              <span>{m.text}</span>
              {m.actions && m.actions.length > 0 && (
                <span className="as-chips">
                  {m.actions.map((a, i) => (
                    <span key={i} className="as-chip">
                      ✓ {a}
                    </span>
                  ))}
                </span>
              )}
            </div>
          ))
        )}
        {chat.busy && (
          <span className="astra-typing" aria-label="thinking">
            <i />
            <i />
            <i />
          </span>
        )}
        <div ref={end} />
      </div>
      <form
        className="chat-compose astra-compose"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <ChatInput placeholder={`Message ${name}`} value={draft} onChange={setDraft} onSend={() => send(draft)} />
        <button type="submit" className="astra-send" aria-label="Send" disabled={!draft.trim() || chat.busy} data-cuelume-tap>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
          </svg>
        </button>
      </form>
    </div>
  )
}

'use client'

import { useEffect } from 'react'

export interface DraftPromptInfo {
  id: string
  recipientName: string | null
  isSelf: boolean
  updatedAt: string
}

interface Props {
  drafts: DraftPromptInfo[] | null
  onResume: (id: string) => void
  onStartNew: () => void
  onClose: () => void
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export default function DraftResumePrompt({ drafts, onResume, onStartNew, onClose }: Props) {
  useEffect(() => {
    if (!drafts) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drafts, onClose])

  if (!drafts || drafts.length === 0) return null

  const label = drafts.length === 1 ? 'an unfinished letter' : `${drafts.length} unfinished letters`

  return (
    <div
      className="draft-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="draft-card">
        <div className="draft-eyebrow">{label}</div>
        <div className="draft-title">pick up where you left off</div>

        <ul className="draft-list">
          {drafts.map((d) => {
            const recipient = d.isSelf
              ? 'future you'
              : d.recipientName?.trim() || 'a friend'
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className="draft-row"
                  onClick={() => onResume(d.id)}
                >
                  <span className="row-mark">✉</span>
                  <span className="row-body">
                    <span className="row-recipient">to {recipient}</span>
                    <span className="row-time">{relativeTime(d.updatedAt)}</span>
                  </span>
                  <span className="row-arrow" aria-hidden>→</span>
                </button>
              </li>
            )
          })}
        </ul>

        <button
          type="button"
          className="btn ghost"
          onClick={onStartNew}
        >
          start a new letter
        </button>
      </div>

      <style jsx>{`
        .draft-overlay {
          position: fixed;
          inset: 0;
          z-index: 240;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(ellipse at center, rgba(40, 28, 18, 0.45) 0%, rgba(15, 10, 6, 0.85) 90%);
          backdrop-filter: blur(10px) saturate(135%);
          -webkit-backdrop-filter: blur(10px) saturate(135%);
          padding: 24px;
          animation: overlayIn 0.25s ease forwards;
        }
        @keyframes overlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .draft-card {
          position: relative;
          width: min(460px, 100%);
          padding: 32px 28px 24px;
          border-radius: 14px;
          background:
            linear-gradient(135deg, #fbf5e2 0%, #f4ead0 100%);
          border: 1px solid rgba(80,60,40,0.25);
          box-shadow:
            0 24px 60px rgba(0,0,0,0.45),
            0 4px 10px rgba(0,0,0,0.25),
            inset 0 1px 0 rgba(255,255,255,0.45);
          text-align: center;
          color: #3a3429;
          font-family: 'Cormorant Garamond', serif;
          animation: cardIn 0.35s cubic-bezier(.2,.9,.3,1) forwards;
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .draft-eyebrow {
          font-style: italic;
          font-size: 13px;
          letter-spacing: 2.2px;
          text-transform: lowercase;
          color: rgba(58, 52, 41, 0.65);
        }
        .draft-title {
          margin-top: 6px;
          font-family: 'Caveat', cursive;
          font-size: 28px;
          line-height: 1.15;
          color: #2d2820;
        }
        .draft-list {
          list-style: none;
          padding: 0;
          margin: 20px 0 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 320px;
          overflow-y: auto;
          text-align: left;
        }
        .draft-row {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: rgba(255, 250, 235, 0.65);
          border: 1px solid rgba(80,60,40,0.18);
          border-radius: 10px;
          cursor: pointer;
          font-family: inherit;
          color: inherit;
          transition: background 0.16s ease, border-color 0.16s ease, transform 0.12s ease;
          text-align: left;
        }
        .draft-row:hover {
          background: rgba(255, 240, 205, 0.85);
          border-color: rgba(80,60,40,0.32);
        }
        .draft-row:active { transform: translateY(1px); }
        .row-mark {
          font-size: 18px;
          color: var(--accent-primary, #a85a4a);
          opacity: 0.75;
          flex-shrink: 0;
        }
        .row-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .row-recipient {
          font-family: 'Caveat', cursive;
          font-size: 20px;
          line-height: 1.1;
          color: #2d2820;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .row-time {
          font-style: italic;
          font-size: 12.5px;
          color: rgba(58, 52, 41, 0.6);
        }
        .row-arrow {
          font-size: 18px;
          color: rgba(58, 52, 41, 0.45);
          flex-shrink: 0;
        }
        .btn {
          width: 100%;
          font-family: 'Caveat', cursive;
          font-size: 20px;
          letter-spacing: 0.5px;
          padding: 10px 18px 12px;
          border-radius: 999px;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.18s ease, background 0.18s ease;
        }
        .btn.ghost {
          background: transparent;
          color: #3a3429;
          border: 1px solid rgba(58, 52, 41, 0.28);
        }
        .btn.ghost:hover { background: rgba(58, 52, 41, 0.06); }
      `}</style>
    </div>
  )
}

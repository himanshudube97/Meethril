'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useThemeStore } from '@/store/theme'
import { useE2EE } from '@/hooks/useE2EE'
import type { JournalEntry } from '@/store/journal'

interface DraftItem {
  id: string
  entryType: 'letter' | 'unsent_letter'
  recipientName: string | null
  recipientEmail: string | null
  text: string
  encryptionType: string
  e2eeIV: string | null
  e2eeIVs: unknown
  isSealed: boolean
  createdAt: string
  updatedAt: string
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

export default function DraftsSection() {
  const theme = useThemeStore((s) => s.theme)
  const router = useRouter()
  const { decryptEntriesFromServer, isE2EEReady } = useE2EE()

  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/letters/drafts')
        const data = await res.json()
        const raw = (data.drafts ?? []) as DraftItem[]
        // Decrypt via the same pattern as SentView / InboxView
        const decrypted = (await decryptEntriesFromServer(
          raw as unknown as JournalEntry[]
        )) as unknown as DraftItem[]
        if (cancelled) return
        setDrafts(decrypted)
      } catch {
        // Silently fail — don't block the Sent tab
      }
    }
    void load()
    return () => { cancelled = true }
  }, [decryptEntriesFromServer, isE2EEReady, refreshTick])

  if (drafts.length === 0) return null

  async function handleDiscard(id: string) {
    const ok = window.confirm('Discard this draft? This cannot be undone.')
    if (!ok) return
    try {
      await fetch(`/api/entries/${id}`, { method: 'DELETE' })
      // Re-fetch from server instead of optimistic filter to avoid race with
      // any in-flight load() call overwriting state with stale data.
      setRefreshTick((t) => t + 1)
    } catch {
      // Silently ignore — draft will still show; user can retry
    }
  }

  return (
    <div className="drafts-section">
      <style jsx>{`
        .drafts-section {
          padding: 0 56px 32px;
          max-width: 900px;
          margin: 0 auto;
          width: 100%;
        }
        @media (max-width: 640px) {
          .drafts-section {
            padding: 0 16px 24px;
          }
        }
      `}</style>
      <p
        style={{
          fontFamily: 'Cormorant Garamond, serif',
          fontStyle: 'italic',
          fontSize: 13,
          letterSpacing: 0.5,
          color: theme.text.muted,
          marginBottom: 12,
          marginTop: 0,
          textAlign: 'center',
          opacity: 0.8,
        }}
      >
        drafts
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {drafts.map((draft) => {
          const recipient =
            draft.entryType === 'letter'
              ? 'Future me'
              : draft.recipientName ?? 'A friend'

          // Try to get a preview from the text field (may be HTML or plain)
          let preview = ''
          try {
            const plainText = stripHtml(draft.text)
            preview = truncate(plainText, 80)
          } catch {
            // If decryption placeholder text ended up here, show nothing
            preview = ''
          }

          // If the preview is an encrypted placeholder, hide it
          if (preview.startsWith('[Encrypted') || preview.startsWith('[Decryption')) {
            preview = ''
          }

          return (
            <div
              key={draft.id}
              role="button"
              tabIndex={0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 12,
                border: `1px solid ${theme.text.primary}18`,
                backgroundColor: `${theme.bg.primary}80`,
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onClick={() => router.push(`/letters/write?id=${draft.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  router.push(`/letters/write?id=${draft.id}`)
                }
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                  `${theme.accent.primary}18`
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                  `${theme.bg.primary}80`
              }}
            >
              {/* Draft icon */}
              <span
                style={{
                  fontSize: 18,
                  lineHeight: 1,
                  opacity: 0.55,
                  flexShrink: 0,
                  color: theme.accent.primary,
                }}
              >
                ✉
              </span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 8,
                    marginBottom: 2,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Cormorant Garamond, serif',
                      fontSize: 14.5,
                      fontWeight: 500,
                      color: theme.text.primary,
                    }}
                  >
                    {recipient}
                  </span>
                  <span
                    style={{
                      fontFamily: 'Cormorant Garamond, serif',
                      fontStyle: 'italic',
                      fontSize: 12,
                      color: theme.text.muted,
                      opacity: 0.75,
                    }}
                  >
                    {relativeTime(draft.updatedAt)}
                  </span>
                </div>

                {preview && (
                  <p
                    style={{
                      margin: 0,
                      fontFamily: 'Cormorant Garamond, serif',
                      fontStyle: 'italic',
                      fontSize: 13,
                      color: theme.text.muted,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {preview}
                  </p>
                )}
              </div>

              {/* Discard button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDiscard(draft.id)
                }}
                title="Discard draft"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18,
                  color: theme.text.muted,
                  padding: '4px 6px',
                  borderRadius: 6,
                  flexShrink: 0,
                  lineHeight: 1,
                  opacity: 0.6,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.opacity = '1'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.opacity = '0.6'
                }}
              >
                ⋯
              </button>
            </div>
          )
        })}
      </div>

    </div>
  )
}

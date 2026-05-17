'use client'

import { useEffect, useState } from 'react'
import type { SentStamp } from '../letterTypes'
import { useE2EEStore } from '@/store/e2ee'
import { decryptString } from '@/lib/e2ee/crypto'
import { useSubscription } from '@/hooks/useSubscription'
import { SenderReceiptStatus } from '../SenderReceiptStatus'
import { AskForCopyButton } from '../AskForCopyButton'

interface Props {
  stamp: SentStamp | null
  onClose: () => void
}

export default function ReceiptModal({ stamp, onClose }: Props) {
  const [peeked, setPeeked] = useState<string | null>(null)
  const masterKey = useE2EEStore((s) => s.masterKey)
  const { isPremium } = useSubscription()

  useEffect(() => {
    setPeeked(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stamp, onClose])

  if (!stamp) return null

  async function peek() {
    if (!confirm('this breaks the seal early.\nare you sure you want to read it now?')) return
    const res = await fetch(`/api/letters/${stamp!.id}/peek`, { method: 'POST' })
    const data = await res.json()
    // For E2EE, the server returns ciphertext + the IV; decrypt locally.
    if (data.encryptionType === 'e2ee') {
      if (!masterKey) {
        setPeeked('[Unlock E2EE to read this letter.]')
        return
      }
      const iv = (data.e2eeIVs as { text?: string } | null)?.text
      if (!iv || !data.body) {
        setPeeked('')
        return
      }
      try {
        const plaintext = await decryptString(data.body, iv, masterKey)
        setPeeked(plaintext)
      } catch {
        setPeeked('[Could not decrypt letter.]')
      }
      return
    }
    setPeeked(data.body || '')
  }

  return (
    <div
      className="receipt-overlay open"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="receipt">
        <button className="close-btn" onClick={onClose}>×</button>
        <h3>{stamp.recipientName ?? 'to future me'}</h3>
        <div className="field">
          <span>sealed</span>
          <span>{new Date(stamp.sealedAt).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric' })}</span>
        </div>
        {stamp.unlockDate && (
          <div className="field">
            <span>opens</span>
            <span>{new Date(stamp.unlockDate).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric' })}</span>
          </div>
        )}
        <div className={`seal-status${stamp.isDelivered ? ' delivered' : ''}`}>
          {stamp.isDelivered ? '✓ delivered' : '✦ still sealed'}
        </div>

        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <SenderReceiptStatus
            unlockDate={stamp.unlockDate}
            isDelivered={stamp.isDelivered}
            firstReadAt={stamp.firstReadAt}
            savedByRecipientAt={stamp.savedByRecipientAt}
            bouncedAt={stamp.bouncedAt}
          />
          {stamp.savedByRecipientAt !== null && isPremium && (
            <AskForCopyButton letterId={stamp.id} recipientName={stamp.recipientName} />
          )}
        </div>

        {!stamp.isDelivered && !peeked && (
          <div className="peek" onClick={peek}>peek at this letter · breaks the seal</div>
        )}
        {peeked && (
          <div
            className="peek-content"
            style={{
              marginTop: 18, padding: 14, background: 'var(--paper-2)',
              borderRadius: 4, textAlign: 'left',
              fontFamily: 'var(--font-caveat), Caveat, cursive',
              fontSize: 16, color: 'var(--text-primary)',
            }}
          >
            {peeked}
          </div>
        )}
      </div>
      <style jsx>{`
        .receipt-overlay {
          position: fixed;
          inset: 0;
          background: rgba(20, 14, 28, 0.45);
          z-index: 100;
          display: none;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(6px);
        }
        .receipt-overlay.open { display: flex; }
        .receipt {
          background: var(--paper-1);
          border: 1px dashed color-mix(in oklab, var(--text-muted) 50%, transparent);
          padding: 28px 32px 26px;
          border-radius: 3px;
          width: min(360px, 90vw);
          box-shadow: 0 30px 70px rgba(0,0,0,0.4);
          text-align: center;
          font-family: 'Cormorant Garamond', serif;
          color: var(--text-primary);
          font-style: italic;
          position: relative;
        }
        .receipt::before {
          content: '— receipt —';
          display: block;
          font-size: 10px;
          letter-spacing: 4px;
          color: var(--text-muted);
          opacity: 0.65;
          margin-bottom: 14px;
          text-transform: lowercase;
        }
        .receipt h3 {
          font-style: normal;
          font-family: 'Caveat', cursive;
          font-size: 28px;
          margin: 0 0 8px;
          color: var(--text-primary);
        }
        .receipt .field {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          margin: 6px 2px;
          border-bottom: 1px dotted color-mix(in oklab, var(--text-muted) 40%, transparent);
          padding-bottom: 4px;
        }
        .receipt .field span:first-child {
          color: var(--text-muted);
          text-transform: lowercase;
          letter-spacing: 1px;
          font-size: 11px;
        }
        .receipt .field span:last-child {
          color: var(--text-primary);
          font-style: normal;
        }
        .receipt .seal-status {
          margin-top: 18px;
          color: var(--accent-primary);
          font-style: italic;
          font-size: 13px;
        }
        .receipt .seal-status.delivered { color: var(--accent-secondary); }
        .receipt .peek {
          margin-top: 14px;
          font-size: 12px;
          color: var(--text-muted);
          opacity: 0.65;
          cursor: pointer;
          text-decoration: underline dotted;
        }
        .receipt .close-btn {
          position: absolute;
          top: 10px; right: 12px;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-muted);
          font-size: 16px;
        }
      `}</style>
    </div>
  )
}

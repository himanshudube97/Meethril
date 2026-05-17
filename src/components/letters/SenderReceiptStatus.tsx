// src/components/letters/SenderReceiptStatus.tsx
'use client'

interface Props {
  unlockDate: string | null
  isDelivered: boolean
  firstReadAt: string | null
  savedByRecipientAt: string | null
  bouncedAt: string | null
}

export function SenderReceiptStatus(props: Props) {
  const status = resolve(props)
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        background: status.bg,
        color: status.fg,
        fontFamily: 'Cormorant Garamond, serif',
        fontStyle: 'italic',
        letterSpacing: 0.3,
      }}
    >
      {status.label}
    </span>
  )
}

function resolve(p: Props): { label: string; bg: string; fg: string } {
  if (p.bouncedAt) return { label: 'Bounced', bg: '#fce8e6', fg: '#a03323' }
  if (p.savedByRecipientAt) return { label: 'Saved by recipient', bg: '#e8f4ea', fg: '#1e6a2a' }
  if (p.firstReadAt) {
    const expired = Date.now() - new Date(p.firstReadAt).getTime() > 24 * 60 * 60 * 1000
    return expired
      ? { label: 'Faded', bg: '#eeeae0', fg: '#7a6a55' }
      : { label: 'Opened', bg: '#e1ecf7', fg: '#1c4773' }
  }
  if (p.isDelivered) return { label: 'Delivered', bg: '#fef2db', fg: '#876124' }
  return { label: 'Scheduled', bg: '#ece9e2', fg: '#5a4f3e' }
}

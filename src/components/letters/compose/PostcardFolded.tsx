'use client'

import { motion } from 'framer-motion'
import { format } from 'date-fns'
import type { LetterRecipient, UnlockChoice } from '../letterTypes'
import { resolveUnlockDate } from '../letterTypes'

interface Props {
  recipient: LetterRecipient
  closeName: string
  unlock: UnlockChoice
  createdAt: Date
  sending: boolean
  onSend: () => void
}

export default function PostcardFolded({
  recipient,
  closeName,
  unlock,
  createdAt,
  sending,
  onSend,
}: Props) {
  const unlockDate = resolveUnlockDate(unlock, createdAt)
  const recipientName = recipient === 'future_me' ? 'future me' : (closeName || 'someone close')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        height: '100%',
      }}
    >
      {/* Folded postcard face */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        style={{
          width: '100%',
          maxWidth: 480,
          height: 240,
          background: `
            linear-gradient(160deg, var(--paper-1, #fff6f2) 0%, var(--paper-2, #fbe6dd) 100%)
          `,
          borderRadius: 8,
          border: '1px solid rgba(80, 55, 40, 0.18)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.30), 0 4px 10px rgba(0,0,0,0.16)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Fold crease line at center */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 1,
            background: 'rgba(120, 90, 50, 0.22)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.45)',
            zIndex: 2,
          }}
        />

        {/* Top fold shadow */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '50%',
            background: 'linear-gradient(180deg, rgba(120,90,50,0.08) 0%, transparent 100%)',
            zIndex: 1,
          }}
        />

        {/* Address area on the folded face */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '24px 36px',
            position: 'relative',
            zIndex: 3,
          }}
        >
          {/* To: line */}
          <div
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: 11,
              letterSpacing: 2.5,
              textTransform: 'uppercase',
              color: 'var(--text-muted, rgba(120, 90, 50, 0.5))',
              marginBottom: 6,
            }}
          >
            to:
          </div>
          <div
            style={{
              fontFamily: 'Caveat, cursive',
              fontSize: 26,
              color: 'var(--text-primary, #3a2025)',
              lineHeight: 1.3,
            }}
          >
            {recipientName}
          </div>

          {/* Opens on date */}
          {unlockDate && (
            <div
              style={{
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontStyle: 'italic',
                fontSize: 13,
                color: 'var(--text-muted, rgba(120, 90, 50, 0.55))',
                marginTop: 8,
              }}
            >
              opens {format(unlockDate, 'MMMM d, yyyy')}
            </div>
          )}

          {/* Written on date */}
          <div
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontStyle: 'italic',
              fontSize: 11,
              color: 'var(--text-muted, rgba(120, 90, 50, 0.40))',
              marginTop: 4,
            }}
          >
            written {format(createdAt, 'MMM d, yyyy')}
          </div>
        </div>

        {/* Wax seal */}
        <motion.div
          initial={{ scale: 0, rotate: -15 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.7, type: 'spring', stiffness: 280, damping: 18 }}
          style={{
            position: 'absolute',
            bottom: 20,
            right: 24,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #c0392b 0%, #8b1a1a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
            zIndex: 4,
          }}
        >
          <span
            style={{
              color: 'rgba(255, 240, 210, 0.9)',
              fontSize: 16,
              fontFamily: 'Caveat, cursive',
            }}
          >
            ✦
          </span>
        </motion.div>

        {/* Stamp top-right */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 52,
            height: 60,
            border: '1.5px dashed rgba(120, 90, 50, 0.40)',
            borderRadius: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            background: 'rgba(120, 90, 50, 0.04)',
            zIndex: 4,
          }}
        >
          <span
            style={{
              color: 'var(--accent-primary, #9a4555)',
              fontSize: 14,
            }}
          >
            ✦
          </span>
          <span
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: 7,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: 'var(--text-muted, rgba(120, 90, 50, 0.50))',
              textAlign: 'center',
            }}
          >
            HEARTH
          </span>
        </div>
      </motion.div>

      {/* Send button */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.4 }}
        onClick={onSend}
        disabled={sending}
        style={{
          padding: '11px 40px 12px',
          borderRadius: 999,
          border: 'none',
          background: sending ? 'rgba(120, 90, 50, 0.3)' : 'var(--accent-primary, #9a4555)',
          color: sending ? 'rgba(120, 90, 50, 0.5)' : '#fff',
          fontFamily: 'Caveat, cursive',
          fontSize: 22,
          cursor: sending ? 'not-allowed' : 'pointer',
          boxShadow: sending ? 'none' : '0 6px 20px rgba(0,0,0,0.22)',
          letterSpacing: 0.3,
          transition: 'background 0.2s, box-shadow 0.2s',
        }}
        whileHover={!sending ? { scale: 1.04, y: -2 } : {}}
        whileTap={!sending ? { scale: 0.97 } : {}}
      >
        {sending ? 'sending…' : 'send →'}
      </motion.button>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import {
  generateStrangerKeypair,
  unwrapStrangerPrivateKey,
  generateAndWrapThreadKey,
  unwrapThreadKey,
  encryptThreadMessage,
  decryptThreadMessage,
} from '@/lib/stranger-e2ee'
import { loadMasterKeyLocally } from '@/lib/e2ee/crypto'

interface ThreadKeyState {
  threadKey: CryptoKey | null
  error: string | null
  loading: boolean
}

interface ThreadKeyInput {
  threadId: string | null
  status: 'unmatched' | 'active' | 'pen_pal' | 'closed_unwaved' | null
  pendingKeyExchange: boolean
  iAmThreadSender: boolean
  myWrappedKey: string | null
  partnerUserId: string | null
}

/**
 * Manages the thread-key lifecycle for a single pen-pal thread.
 * - Lazily initialize the user's stranger keypair if missing.
 * - On pendingKeyExchange, generate a thread key, wrap, post to /keys.
 * - Otherwise, unwrap the existing thread key.
 *
 * Returns the unwrapped CryptoKey ready for AES-GCM encrypt/decrypt.
 * Only runs for status==='pen_pal'. For other statuses returns {threadKey:null, ...}.
 */
export function useStrangerThreadKey(input: ThreadKeyInput): ThreadKeyState {
  const [state, setState] = useState<ThreadKeyState>({ threadKey: null, error: null, loading: false })

  useEffect(() => {
    const { threadId, status, pendingKeyExchange, iAmThreadSender, myWrappedKey, partnerUserId } = input
    if (!threadId || status !== 'pen_pal' || !partnerUserId) {
      setState({ threadKey: null, error: null, loading: false })
      return
    }

    let cancelled = false

    ;(async () => {
      setState({ threadKey: null, error: null, loading: true })
      try {
        const masterKey = await loadMasterKeyLocally()
        if (!masterKey) {
          throw new Error('Unlock your master key first to read pen-pal threads.')
        }

        const meRes = await fetch('/api/auth/me', { credentials: 'include' })
        if (!meRes.ok) throw new Error('Could not fetch user info')
        const me = await meRes.json()
        let myPublicKey: string | null = me?.strangerPublicKey ?? null
        let myWrappedPrivateKey: string | null = me?.strangerWrappedPrivateKey ?? null

        if (!myPublicKey || !myWrappedPrivateKey) {
          const fresh = await generateStrangerKeypair(masterKey)
          const initRes = await fetch('/api/stranger-notes/keys/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(fresh),
          })
          if (!initRes.ok) throw new Error('Failed to init stranger keypair')
          myPublicKey = fresh.publicKey
          myWrappedPrivateKey = fresh.wrappedPrivateKey
        }

        const myPrivate = await unwrapStrangerPrivateKey(myWrappedPrivateKey, masterKey)

        const pkRes = await fetch(
          `/api/stranger-notes/users/${encodeURIComponent(partnerUserId)}/public-key`,
          { credentials: 'include' }
        )
        if (!pkRes.ok) throw new Error('Could not fetch partner public key')
        const { publicKey: partnerPublic } = await pkRes.json()

        if (pendingKeyExchange) {
          const { wrappedForMe, wrappedForPartner, threadKey } =
            await generateAndWrapThreadKey(myPrivate, myPublicKey, partnerPublic)

          // I AM the thread sender → my wrapped key goes in wrappedKeyForSender, partner's in wrappedKeyForRecipient.
          // I AM the thread recipient → my wrapped key goes in wrappedKeyForRecipient, partner's in wrappedKeyForSender.
          const senderSlot = iAmThreadSender ? wrappedForMe : wrappedForPartner
          const recipientSlot = iAmThreadSender ? wrappedForPartner : wrappedForMe

          const postRes = await fetch(
            `/api/stranger-notes/threads/${encodeURIComponent(threadId)}/keys`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                wrappedKeyForSender: senderSlot,
                wrappedKeyForRecipient: recipientSlot,
              }),
            }
          )
          if (postRes.status === 409) {
            // Race lost — partner client already exchanged. Re-fetch and unwrap normally.
            const tRes = await fetch(`/api/stranger-notes/threads/${threadId}`, { credentials: 'include' })
            const t = await tRes.json()
            if (!t.myWrappedKey) throw new Error('No wrapped key after race')
            const unwrapped = await unwrapThreadKey(t.myWrappedKey, myPrivate, partnerPublic)
            if (!cancelled) setState({ threadKey: unwrapped, error: null, loading: false })
            return
          }
          if (!postRes.ok) throw new Error('Failed to post thread keys')
          if (!cancelled) setState({ threadKey, error: null, loading: false })
        } else if (myWrappedKey) {
          const unwrapped = await unwrapThreadKey(myWrappedKey, myPrivate, partnerPublic)
          if (!cancelled) setState({ threadKey: unwrapped, error: null, loading: false })
        } else {
          throw new Error('No wrapped key on thread')
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            threadKey: null,
            error: e instanceof Error ? e.message : 'E2EE setup failed',
            loading: false,
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [input.threadId, input.status, input.pendingKeyExchange, input.iAmThreadSender, input.myWrappedKey, input.partnerUserId])

  return state
}

export { encryptThreadMessage, decryptThreadMessage }

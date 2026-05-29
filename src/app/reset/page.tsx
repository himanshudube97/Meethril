'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResetPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (password !== confirm) {
      setErr('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setErr('Password must be at least 8 characters')
      return
    }
    setSubmitting(true)
    const res = await fetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setErr(data.error || 'Reset failed')
      return
    }
    router.push('/login?reset=success')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-stone-50 px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow p-8">
        <h1 className="text-2xl font-serif text-stone-800 mb-2">Set a new password</h1>
        <p className="text-stone-600 text-sm mb-4">
          Choose a password you&apos;ll remember. Minimum 8 characters.
        </p>
        <form onSubmit={onSubmit}>
          <div className="relative mb-3">
            <input
              type={show ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 transition-colors"
            >
              {show ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l18 18" />
                  <path d="M10.58 10.58a2 2 0 002.83 2.83" />
                  <path d="M9.36 5.18A9.46 9.46 0 0112 5c4.64 0 8.58 3.06 9.9 7a10.7 10.7 0 01-2.07 3.4M6.1 6.1A10.75 10.75 0 002.1 12c1.32 3.94 5.26 7 9.9 7a9.5 9.5 0 003.9-.83" />
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.1 12C3.42 8.06 7.36 5 12 5s8.58 3.06 9.9 7c-1.32 3.94-5.26 7-9.9 7s-8.58-3.06-9.9-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          <input
            type={show ? 'text' : 'password'}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 mb-3"
          />
          {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-stone-800 text-white rounded-lg py-2 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      </div>
    </main>
  )
}

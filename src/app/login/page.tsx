'use client'

import { useState, useEffect, Suspense, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'

const isDevAuth = process.env.NEXT_PUBLIC_USE_DEV_AUTH === 'true'

// Email + password sign-in is hidden for now — Google-only. UI gate only; the
// backend handlers stay intact, so flipping this back to true fully restores it.
const PASSWORD_LOGIN_ENABLED: boolean = false

type SupabaseStep = 'form' | 'otp'
type AuthMode = 'login' | 'signup'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/write'
  const error = searchParams.get('error')
  const theme = useThemeStore(s => s.theme)

  // The page uses var(--text-primary)/var(--card-bg)/etc throughout, but those
  // tokens aren't set globally — only feature islands (letters/scrapbook) inject
  // them. Without this, the login text falls back to body's foreground (#e8e8e8)
  // and becomes illegible on every light theme. Map the active theme onto the
  // tokens this page consumes.
  const themeVars = {
    '--text-primary': theme.text.primary,
    '--text-secondary': theme.text.secondary,
    '--text-muted': theme.text.muted,
    '--accent-primary': theme.accent.primary,
    '--card-bg': theme.glass.bg,
    '--card-border': theme.glass.border,
    '--input-bg': `color-mix(in oklab, ${theme.bg.secondary} 60%, transparent)`,
    '--input-border': `color-mix(in oklab, ${theme.text.primary} 18%, transparent)`,
  } as CSSProperties

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState(error ? 'Authentication failed. Please try again.' : '')
  const [infoMessage, setInfoMessage] = useState('')
  const [step, setStep] = useState<SupabaseStep>('form')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const handleResendOtp = async () => {
    if (!email || resendCooldown > 0) return
    setLoginError('')
    const res = await fetch('/api/auth/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setLoginError(data.error || 'Failed to resend')
      return
    }
    setResendCooldown(60)
    setInfoMessage('A new code has been sent.')
  }

  const fillDevCreds = () => {
    setEmail('dev@hearth.app')
    setPassword('123')
  }

  // Dev auth: any email/password creates or logs in
  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectTo: redirect }),
      })
      const data = await res.json()
      if (data.success) {
        window.location.href = data.redirectTo || '/write'
      } else {
        setLoginError(data.error || 'Login failed')
      }
    } catch {
      setLoginError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Supabase email + password login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'email_login', email, password, redirectTo: redirect }),
      })
      const data = await res.json()
      if (data.success) {
        window.location.href = data.redirectTo || '/write'
      } else {
        setLoginError(data.error || 'Login failed')
      }
    } catch {
      setLoginError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Supabase signup → triggers OTP email
  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'email_signup', email, password }),
      })
      const data = await res.json()
      if (data.requiresOtp) {
        setStep('otp')
        setInfoMessage(data.message || 'Check your email for a verification code.')
      } else if (data.success) {
        window.location.href = redirect || '/write'
      } else {
        setLoginError(data.error || 'Signup failed')
      }
    } catch {
      setLoginError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Supabase OTP verification
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_otp', email, token: otpCode, redirectTo: redirect }),
      })
      const data = await res.json()
      if (data.success) {
        window.location.href = data.redirectTo || '/write'
      } else {
        setLoginError(data.error || 'Invalid code')
      }
    } catch {
      setLoginError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Google OAuth
  const handleGoogleLogin = async () => {
    setLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectTo: redirect }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setLoginError(data.error || 'Login failed')
        setLoading(false)
      }
    } catch {
      setLoginError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center px-4" style={themeVars}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-block mb-6 text-xs tracking-[0.3em] text-[var(--text-muted)] opacity-60 hover:opacity-100 transition"
          >
            ← MEETHRIL
          </Link>
          <h1 className="font-[var(--font-serif)] text-4xl text-[var(--text-primary)] mb-2">
            Welcome to Meethril
          </h1>
          <p className="text-[var(--text-muted)]">A meditative journal that listens</p>
        </div>

        <div className="bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)] rounded-2xl p-8 shadow-lg">
          {loginError && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {loginError}
            </div>
          )}
          {infoMessage && (
            <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 text-sm text-center">
              {infoMessage}
            </div>
          )}

          {/* ── Dev auth ── */}
          {isDevAuth && (
            <form onSubmit={handleDevLogin} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm text-[var(--text-muted)] mb-2">Email</label>
                <input
                  type="email" id="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com" required
                  className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm text-[var(--text-muted)] mb-2">
                  Password <span className="ml-2 text-xs opacity-60">(any password works in dev mode)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'} id="password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-12 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                  />
                  <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(v => !v)} />
                </div>
              </div>
              <button
                type="submit" disabled={loading || !email}
                className="w-full py-3 bg-[var(--accent-primary)] text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <button type="button" onClick={fillDevCreds} className="w-full py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                Fill Dev Creds
              </button>
              <p className="text-center text-sm text-[var(--text-muted)] mt-2">
                Development mode — any email creates or logs into an account
              </p>
            </form>
          )}

          {/* ── Supabase auth ── */}
          {!isDevAuth && step === 'form' && (
            <div className="space-y-5">
              {/* Email + password sign-in — hidden for now (Google only).
                  Flip PASSWORD_LOGIN_ENABLED to restore. */}
              {PASSWORD_LOGIN_ENABLED && (
              <>
              <form onSubmit={authMode === 'login' ? handleEmailLogin : handleEmailSignup} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm text-[var(--text-muted)] mb-2">Email</label>
                  <input
                    type="email" id="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com" required
                    className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm text-[var(--text-muted)] mb-2">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'} id="password" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••" required minLength={6}
                      className="w-full px-4 py-3 pr-12 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                    />
                    <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(v => !v)} />
                  </div>
                </div>
                <button
                  type="submit" disabled={loading || !email || !password}
                  className="w-full py-3 bg-[var(--accent-primary)] text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (authMode === 'login' ? 'Signing in...' : 'Creating account...') : (authMode === 'login' ? 'Sign In' : 'Create Account')}
                </button>
                {authMode === 'login' && (
                  <div className="text-right -mt-2">
                    <Link href="/forgot" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                      Forgot password?
                    </Link>
                  </div>
                )}
              </form>

              {/* Toggle login/signup */}
              <p className="text-center text-sm text-[var(--text-muted)]">
                {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setLoginError('') }}
                  className="text-[var(--accent-primary)] hover:opacity-80 transition-opacity"
                >
                  {authMode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </p>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[var(--card-border)]" />
                <span className="text-xs text-[var(--text-muted)]">or</span>
                <div className="flex-1 h-px bg-[var(--card-border)]" />
              </div>
              </>
              )}

              {/* Google OAuth */}
              <button
                onClick={handleGoogleLogin} disabled={loading}
                className="w-full py-3 bg-white text-gray-800 rounded-xl font-medium flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <GoogleIcon />
                {loading ? 'Redirecting...' : 'Sign in with Google'}
              </button>

              <p className="text-center text-sm text-[var(--text-muted)]">
                Your journal entries are private and secure
              </p>

              {authMode === 'signup' && (
                <p className="text-center text-sm text-[var(--text-muted)] leading-relaxed">
                  By creating an account you agree to our{' '}
                  <Link href="/terms" className="text-[var(--accent-primary)] hover:opacity-80 transition-opacity">Terms</Link>
                  {' '}and{' '}
                  <Link href="/privacy" className="text-[var(--accent-primary)] hover:opacity-80 transition-opacity">Privacy Policy</Link>.
                </p>
              )}
            </div>
          )}

          {/* ── OTP verification step ── */}
          {!isDevAuth && step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div>
                <label htmlFor="otp" className="block text-sm text-[var(--text-muted)] mb-2">
                  Verification code
                </label>
                <input
                  type="text" id="otp" value={otpCode}
                  inputMode="numeric" autoComplete="one-time-code"
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="000000" required maxLength={8}
                  className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors text-center text-2xl tracking-widest"
                />
                <p className="text-sm text-[var(--text-muted)] mt-2 text-center">
                  Sent to {email}
                </p>
              </div>
              <button
                type="submit" disabled={loading || otpCode.length < 6}
                className="w-full py-3 bg-[var(--accent-primary)] text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>
              <p className="text-sm text-[var(--text-muted)] text-center -mt-2">
                Enter the {' '}code from your email (6–8 digits)
              </p>
              <button
                type="button" onClick={handleResendOtp} disabled={resendCooldown > 0 || !email}
                className="w-full py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>
              <button
                type="button" onClick={() => { setStep('form'); setOtpCode(''); setLoginError(''); setInfoMessage('') }}
                className="w-full py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Back
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus:outline-none"
    >
      {shown ? (
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
  )
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <p className="text-[var(--text-muted)]">Loading...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}

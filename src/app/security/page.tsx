'use client'

import { useThemeStore } from '@/store/theme'
import Link from 'next/link'
import { BackfillRetryPanel } from '@/components/security/BackfillRetryPanel'

export default function SecurityPage() {
  const { theme } = useThemeStore()

  return (
    <div
      className="min-h-screen py-12 px-6"
      style={{ background: theme.bg.primary, color: theme.text.primary }}
    >
      <main className="max-w-2xl mx-auto space-y-8">
        {/* Back link */}
        <Link
          href="/me"
          className="text-sm underline"
          style={{ color: theme.text.muted }}
        >
          ← back to profile
        </Link>

        <h1
          className="text-3xl font-light"
          style={{ color: theme.text.primary }}
        >
          How Meethril keeps your journal private
        </h1>

        <BackfillRetryPanel />

        {/* Server-side encryption */}
        <section className="space-y-3">
          <h2
            className="text-xl font-light"
            style={{ color: theme.accent.primary }}
          >
            Server-side encryption (default)
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: theme.text.secondary }}>
            Every Meethril account starts with server-side encryption. Your text, photos, doodles,
            and letter contents are encrypted before being stored in our database. If our database
            leaks, the data is unreadable without our encryption key.
          </p>
        </section>

        {/* E2EE */}
        <section className="space-y-4">
          <h2
            className="text-xl font-light"
            style={{ color: theme.accent.primary }}
          >
            End-to-end encryption (optional)
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: theme.text.secondary }}>
            On your profile page you can enable end-to-end encryption. With it on, your journal is
            encrypted with a key only you have — not even Meethril can read your entries, photos,
            doodles, or scrapbook items.
          </p>

          {/* What we can see */}
          <div className="space-y-2">
            <h3
              className="text-base font-light"
              style={{ color: theme.text.primary }}
            >
              What we can still see
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: theme.text.secondary }}>
              Even with E2EE on, our servers see structural details that we need to make the app work:
            </p>
            <ul
              className="text-sm space-y-1 pl-4"
              style={{ color: theme.text.secondary }}
            >
              {[
                'When you wrote (timestamps)',
                'What type of thing it was (a journal entry, a sealed letter, etc.)',
                'Whether and when a sealed letter was delivered',
                "The recipient's email address for letters to friends (we need it to send the email)",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span style={{ color: theme.text.muted }}>·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* What we cannot see */}
          <div className="space-y-2">
            <h3
              className="text-base font-light"
              style={{ color: theme.text.primary }}
            >
              What we cannot see
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: theme.text.secondary }}>
              With E2EE on, we cannot see the contents of your entries, photos, doodles,
              your tags, the song you attached, the names you wrote in self-letters, or your scrapbook
              items. Server breach, support staff, or government request — none of them have a path
              to your contents.
            </p>
          </div>
        </section>

        {/* Divider */}
        <div className="h-px" style={{ background: theme.glass.border }} />

        {/* Two keys */}
        <section className="space-y-3">
          <h2
            className="text-xl font-light"
            style={{ color: theme.accent.primary }}
          >
            Two keys, one job
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: theme.text.secondary }}>
            When you enable E2EE, you&apos;ll set a{' '}
            <strong style={{ color: theme.text.primary }}>daily key</strong>{' '}
            (a passphrase you&apos;ll type often) and receive a{' '}
            <strong style={{ color: theme.text.primary }}>recovery key</strong>{' '}
            (a long random string we ask you to save). Either one can unlock your journal — the
            daily key is for everyday use, the recovery key is your backup.
          </p>
        </section>

        {/* Forgot daily key */}
        <section className="space-y-3">
          <h2
            className="text-xl font-light"
            style={{ color: theme.accent.primary }}
          >
            What happens if you forget your daily key
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: theme.text.secondary }}>
            Use your recovery key to unlock. You&apos;ll set a new daily key. Your journal continues
            to work with all your existing entries.
          </p>
        </section>

        {/* Lost both keys */}
        <section className="space-y-3">
          <h2
            className="text-xl font-light"
            style={{ color: theme.accent.primary }}
          >
            What happens if you lose both keys
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: theme.text.secondary }}>
            Your encrypted journal cannot be recovered. There is no password reset, no support
            backdoor — by design. We chose this because the alternative — a way for us to
            recover your journal without your keys — would mean we could read your journal too.
          </p>
          <p
            className="text-sm leading-relaxed font-medium"
            style={{ color: theme.text.primary }}
          >
            Save your recovery key somewhere only you can access. We do not email it to you, do
            not back it up to our cloud, and do not have any copy of it.
          </p>
        </section>

        {/* Back to profile */}
        <div className="pt-4">
          <Link
            href="/me"
            className="text-sm underline"
            style={{ color: theme.text.muted }}
          >
            ← back to profile
          </Link>
        </div>
      </main>
    </div>
  )
}

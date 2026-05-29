import type { Metadata } from 'next'
import LegalShell from '@/components/legal/LegalShell'
import { legal } from '@/lib/legal'

export const metadata: Metadata = {
  title: `Privacy Policy · ${legal.brand}`,
  description: `How ${legal.brand} collects, uses, and protects your data.`,
}

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p className="last-updated">Last updated: {legal.lastUpdated}</p>

      <p>
        {legal.brand} is a private journaling space. This policy explains what we
        collect, why, and the choices you have. We&apos;ve tried to write it in
        plain language. If anything is unclear, email{' '}
        <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>
          Your journal entries, letters, scrapbook items, photos, and doodles are
          <strong> end-to-end encrypted</strong>. They are encrypted on your device
          before they ever reach our servers, and <strong>we cannot read them</strong>.
        </li>
        <li>We collect the minimum needed to run an account, billing, and email.</li>
        <li>We never sell your data, and we don&apos;t serve third-party ads.</li>
      </ul>

      <h2>Information we collect</h2>
      <h3>Account information</h3>
      <p>
        When you sign up we store your email address and, if you use Google sign-in,
        the basic profile (name, avatar) Google returns. Passwords are handled by our
        authentication provider and are never stored by us in plain text.
      </p>

      <h3>Your private content (end-to-end encrypted)</h3>
      <p>
        Journal entries, letters, scrapbook items, photos, and doodles are encrypted
        in your browser with a key derived from your master password. We store only
        the ciphertext. Because we never hold your key, we cannot read this content,
        recover it if you lose your key, or hand a readable copy to anyone.
      </p>

      <h3>Content we can read</h3>
      <p>For a small set of features we hold the key so the service can function:</p>
      <ul>
        <li>
          <strong>Profile details</strong> (such as a nickname or birthday used for
          reminders) are encrypted on our servers under our own key so a scheduled job
          can, for example, send you a reminder email.
        </li>
        <li>
          <strong>&ldquo;Notes to a stranger&rdquo; and replies</strong> are encrypted on
          our servers rather than end-to-end, because this is a shared, anonymous space
          and we must be able to moderate it for safety.
        </li>
      </ul>

      <h3>Billing information</h3>
      <p>
        Payments are processed by Lemon Squeezy, our Merchant of Record. We do not see
        or store your full card details. We retain a subscription status and billing
        identifiers so we know whether your account is active.
      </p>

      <h3>Technical information</h3>
      <p>
        Like most web services, our hosting providers process basic technical data
        (IP address, browser type, timestamps) to deliver and secure the app. We use
        strictly-necessary cookies to keep you signed in.
      </p>

      <h2>How we use your information</h2>
      <ul>
        <li>To provide and maintain your account and the journaling features.</li>
        <li>To process subscriptions and send billing-related messages.</li>
        <li>To send transactional and reminder emails you&apos;ve opted into.</li>
        <li>To keep the service secure and to moderate shared spaces.</li>
        <li>To comply with legal obligations.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        We don&apos;t sell your personal data. We share limited data with the service
        providers that make the app work, each acting on our behalf:
      </p>
      <ul>
        {legal.processors.map((p) => (
          <li key={p.name}>
            <strong>{p.name}</strong> — {p.purpose} (
            <a href={p.link} target="_blank" rel="noopener noreferrer">privacy policy</a>).
          </li>
        ))}
      </ul>
      <p>
        We may also disclose information if required by law, or to protect the rights
        and safety of our users and the public.
      </p>

      <h2>Data retention</h2>
      <p>
        We keep your data for as long as your account is active. When you delete your
        account, we delete your content and personal data, except where we must retain
        limited records (for example, billing records) to meet legal obligations.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, export,
        or delete your personal data, and to object to or restrict certain processing.
        To exercise any of these, email{' '}
        <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>. Note that for
        end-to-end encrypted content we can return only the encrypted data we hold, since
        we cannot decrypt it.
      </p>

      <h2>Children</h2>
      <p>
        {legal.brand} is not directed to children under 13 (or the minimum age in your
        country), and we do not knowingly collect their data.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. We&apos;ll revise the &ldquo;last
        updated&rdquo; date above and, for material changes, give notice in the app or by
        email.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Email{' '}
        <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>. This service is
        operated by {legal.entity}.
      </p>

      <p className="disclaimer">
        This document is provided for transparency and is not legal advice.
      </p>
    </LegalShell>
  )
}

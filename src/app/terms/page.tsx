import type { Metadata } from 'next'
import LegalShell from '@/components/legal/LegalShell'
import { legal } from '@/lib/legal'

export const metadata: Metadata = {
  title: `Terms of Service · ${legal.brand}`,
  description: `The terms that govern your use of ${legal.brand}.`,
}

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <p className="last-updated">Last updated: {legal.lastUpdated}</p>

      <p>
        These Terms govern your use of {legal.brand} (the &ldquo;Service&rdquo;),
        operated by {legal.entity}. By creating an account or using the Service, you
        agree to these Terms. If you don&apos;t agree, please don&apos;t use the Service.
      </p>

      <h2>Your account</h2>
      <p>
        You must provide accurate information and are responsible for keeping your
        account secure. You must be at least 13 years old (or the minimum age in your
        country) to use the Service.
      </p>
      <p>
        <strong>Important — encryption and recovery:</strong> Your private content is
        end-to-end encrypted with a key derived from your master password. We never
        receive that key. If you lose it and your recovery key, your content cannot be
        recovered by anyone, including us. Please store your recovery key safely.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for anything unlawful, harmful, or abusive.</li>
        <li>
          Post content in shared spaces (such as &ldquo;notes to a stranger&rdquo;) that
          is harassing, hateful, threatening, sexually explicit involving minors, or
          otherwise violates others&apos; rights.
        </li>
        <li>Attempt to break, overload, reverse-engineer, or gain unauthorized access to the Service.</li>
        <li>Resell or commercially exploit the Service without our permission.</li>
      </ul>
      <p>
        We may remove content or suspend accounts that violate these Terms, particularly
        to keep shared spaces safe.
      </p>

      <h2>Your content</h2>
      <p>
        You own your content. You retain all rights to the entries, letters, photos, and
        other material you create. You grant us only the limited permission needed to
        store and display it back to you and to operate the features you use.
      </p>

      <h2>Subscriptions, billing &amp; refunds</h2>
      <p>
        Some features require a paid subscription. Payments are processed by Lemon Squeezy,
        our Merchant of Record, and are subject to their terms at checkout.
      </p>
      <ul>
        <li>Subscriptions renew automatically until cancelled.</li>
        <li>You can cancel anytime; access continues until the end of the current billing period.</li>
        <li>
          Except where required by law, payments are generally non-refundable. If you
          believe you were charged in error, contact{' '}
          <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>.
        </li>
        <li>Prices may change; we&apos;ll give notice before changes affect your renewal.</li>
      </ul>

      <h2>Service availability</h2>
      <p>
        We work to keep the Service available and reliable, but we provide it on an
        &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We don&apos;t guarantee
        it will be uninterrupted or error-free, and we may modify or discontinue features.
      </p>

      <h2>Disclaimer &amp; limitation of liability</h2>
      <p>
        {legal.brand} is a journaling tool, not a medical, mental-health, or crisis
        service. It is not a substitute for professional help. If you are in distress,
        please contact a qualified professional or your local emergency services.
      </p>
      <p>
        To the fullest extent permitted by law, {legal.entity} is not liable for any
        indirect, incidental, or consequential damages, or for loss of data resulting
        from a lost encryption key. Our total liability is limited to the amount you paid
        us in the 12 months before the claim.
      </p>

      <h2>Termination</h2>
      <p>
        You may delete your account at any time. We may suspend or terminate access if
        you violate these Terms. On termination, your right to use the Service ends and
        we delete your data as described in our{' '}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. We&apos;ll revise the &ldquo;last
        updated&rdquo; date and, for material changes, give notice in the app or by email.
        Continued use after changes means you accept the updated Terms.
      </p>

      <h2>Governing law</h2>
      <p>
        These Terms are governed by the laws of {legal.governingLaw}, without regard to
        conflict-of-law principles. Disputes will be subject to the courts located there.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms? Email{' '}
        <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>.
      </p>

      <p className="disclaimer">
        This document is provided for transparency and is not legal advice.
      </p>
    </LegalShell>
  )
}

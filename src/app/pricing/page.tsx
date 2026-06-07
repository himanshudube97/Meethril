'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useThemeStore } from '@/store/theme'
import { useSubscription, createCheckoutSession } from '@/hooks/useSubscription'

const freeTier = {
  name: 'Free',
  price: '$0',
  period: 'forever',
  description: 'Begin your journaling journey',
  features: [
    { text: '15 journal entries per month', included: true },
    { text: 'Every theme & cursor', included: true },
    { text: '5 letters to your future self / month', included: true },
    { text: '5 letters to a friend / month', included: true },
    { text: '10 scrapbook pages / month', included: true },
    { text: '2 stranger notes per day', included: true },
    { text: 'Calendar & search', included: true },
    { text: 'Memory — revisit your past writings', included: true },
  ],
}

const premiumTier = {
  name: 'Premium',
  monthlyPrice: '$4',
  monthlyPeriod: '/month',
  yearlyPrice: '$32',
  yearlyOriginal: '$48',
  yearlyPeriod: '/year',
  yearlySavings: 'Save 4 months',
  description: 'More room to reflect & connect',
  features: [
    { text: 'Unlimited journal entries (1 per day)', included: true },
    { text: '10 letters to your future self / month', included: true },
    { text: '10 letters to a friend / month', included: true },
    { text: '30 scrapbook pages / month', included: true },
    { text: '5 stranger notes per day', included: true },
    { text: 'Ask friends to save a copy of their letter', included: true },
    { text: 'Memory — revisit your past writings', included: true },
    { text: 'Every theme, cursor & view — always', included: true },
  ],
}

export default function PricingPage() {
  const { theme } = useThemeStore()
  const { isPremium, plan, isLoading, isAdmin } = useSubscription()
  const [checkoutLoading, setCheckoutLoading] = useState<'monthly' | 'yearly' | 'test' | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  // Check for success/canceled query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowSuccess(true)
      // Clean up URL
      window.history.replaceState({}, '', '/pricing')
    }
  }, [])

  const handleCheckout = async (priceId: 'monthly' | 'yearly' | 'test') => {
    try {
      setCheckoutLoading(priceId)
      const url = await createCheckoutSession(priceId)
      if (url) {
        window.location.href = url
      }
    } catch (error: unknown) {
      console.error('Checkout error:', error)
      // If unauthorized, redirect to login
      if (error instanceof Error && error.message === 'Unauthorized') {
        window.location.href = '/login?redirect=/pricing'
        return
      }
      alert('Failed to start checkout. Please try again.')
    } finally {
      setCheckoutLoading(null)
    }
  }

  return (
    <main
      className="min-h-screen relative overflow-hidden"
      style={{
        background: theme.bg.gradient,
        color: theme.text.primary,
      }}
    >
      {/* Ambient Background */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${theme.accent.primary}20 0%, transparent 70%)`,
            filter: 'blur(60px)',
            top: '-10%',
            right: '-10%',
          }}
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute w-[400px] h-[400px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${theme.accent.secondary}15 0%, transparent 70%)`,
            filter: 'blur(50px)',
            bottom: '10%',
            left: '-5%',
          }}
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 2,
          }}
        />
      </div>

      {/* Success Message */}
      {showSuccess && (
        <motion.div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full"
          style={{
            background: theme.accent.primary,
            color: theme.bg.primary,
          }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
        >
          Welcome to Premium! Your subscription is now active.
        </motion.div>
      )}

      {/* Back to Home */}
      <div className="relative z-10 p-6">
        <Link href="/">
          <motion.span
            className="text-sm hover:opacity-80 transition-opacity cursor-pointer"
            style={{ color: theme.text.muted }}
            whileHover={{ x: -3 }}
          >
            ← Back to Hearth
          </motion.span>
        </Link>
      </div>

      {/* Content */}
      <div className="relative z-10 px-6 pb-20 max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.8 }}
        >
          <motion.span
            className="text-4xl mb-6 block"
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            ✨
          </motion.span>
          <motion.h1
            className="text-4xl md:text-5xl font-serif mb-4"
            style={{ color: theme.text.primary }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Simple, gentle pricing
          </motion.h1>
          <motion.p
            className="text-lg max-w-xl mx-auto"
            style={{ color: theme.text.secondary }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Start free, upgrade when you need more space for your thoughts
          </motion.p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Free Tier */}
          <motion.div
            className="relative p-8 rounded-3xl"
            style={{
              background: theme.glass.bg,
              backdropFilter: `blur(${theme.glass.blur})`,
              border: `1px solid ${theme.glass.border}`,
            }}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6, delay: 0.1 }}
            whileHover={{ y: -5 }}
          >
            <div className="mb-8">
              <h2
                className="text-2xl font-medium mb-2"
                style={{ color: theme.text.primary }}
              >
                {freeTier.name}
              </h2>
              <p
                className="text-sm mb-4"
                style={{ color: theme.text.muted }}
              >
                {freeTier.description}
              </p>
              <div className="flex items-baseline gap-1">
                <span
                  className="text-4xl font-serif"
                  style={{ color: theme.text.primary }}
                >
                  {freeTier.price}
                </span>
                <span style={{ color: theme.text.muted }}>
                  {freeTier.period}
                </span>
              </div>
            </div>

            <ul className="space-y-4 mb-8">
              {freeTier.features.map((feature, i) => (
                <motion.li
                  key={i}
                  className="flex items-start gap-3"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                >
                  <span style={{ color: theme.accent.primary }}>✓</span>
                  <span style={{ color: theme.text.secondary }}>
                    {feature.text}
                  </span>
                </motion.li>
              ))}
            </ul>

            <Link href="/write">
              <motion.button
                className="w-full py-3 rounded-full font-medium transition-all"
                style={{
                  background: 'transparent',
                  border: `1px solid ${theme.glass.border}`,
                  color: theme.text.primary,
                }}
                whileHover={{
                  background: theme.glass.bg,
                  scale: 1.02,
                }}
                whileTap={{ scale: 0.98 }}
              >
                Start Free
              </motion.button>
            </Link>
          </motion.div>

          {/* Premium Tier */}
          <motion.div
            className="relative p-8 rounded-3xl"
            style={{
              background: theme.glass.bg,
              backdropFilter: `blur(${theme.glass.blur})`,
              border: `2px solid ${theme.accent.primary}40`,
              boxShadow: `0 0 60px ${theme.accent.primary}15`,
            }}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6, delay: 0.2 }}
            whileHover={{ y: -5 }}
          >
            {/* Popular Badge */}
            <motion.div
              className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-sm"
              style={{
                background: theme.accent.primary,
                color: theme.bg.primary,
              }}
              initial={{ opacity: 0, y: -10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
            >
              Most loved
            </motion.div>

            <div className="mb-8 mt-2">
              <h2
                className="text-2xl font-medium mb-2"
                style={{ color: theme.text.primary }}
              >
                {premiumTier.name}
              </h2>
              <p
                className="text-sm mb-6"
                style={{ color: theme.text.muted }}
              >
                {premiumTier.description}
              </p>

              {/* Monthly Price */}
              <div className="flex items-baseline gap-1 mb-3">
                <span
                  className="text-3xl font-serif"
                  style={{ color: theme.text.primary }}
                >
                  {premiumTier.monthlyPrice}
                </span>
                <span style={{ color: theme.text.muted }}>
                  {premiumTier.monthlyPeriod}
                </span>
              </div>

              {/* Divider */}
              <div
                className="flex items-center gap-3 mb-3"
                style={{ color: theme.text.muted }}
              >
                <div className="flex-1 h-px" style={{ background: theme.glass.border }} />
                <span className="text-xs">or</span>
                <div className="flex-1 h-px" style={{ background: theme.glass.border }} />
              </div>

              {/* Yearly Price with Strikethrough */}
              <div className="flex items-baseline gap-2 flex-wrap">
                <span
                  className="text-lg line-through opacity-50"
                  style={{ color: theme.text.muted }}
                >
                  {premiumTier.yearlyOriginal}
                </span>
                <span
                  className="text-3xl font-serif"
                  style={{ color: theme.text.primary }}
                >
                  {premiumTier.yearlyPrice}
                </span>
                <span style={{ color: theme.text.muted }}>
                  {premiumTier.yearlyPeriod}
                </span>
                <span
                  className="text-xs px-2 py-1 rounded-full ml-1"
                  style={{
                    background: `${theme.accent.warm}20`,
                    color: theme.accent.warm,
                  }}
                >
                  {premiumTier.yearlySavings}
                </span>
              </div>
            </div>

            <ul className="space-y-4 mb-8">
              {premiumTier.features.map((feature, i) => (
                <motion.li
                  key={i}
                  className="flex items-start gap-3"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.25 + i * 0.05 }}
                >
                  <span style={{ color: theme.accent.primary }}>✓</span>
                  <span style={{ color: theme.text.secondary }}>
                    {feature.text}
                  </span>
                </motion.li>
              ))}
            </ul>

            {/* Two CTA Buttons */}
            <div className="space-y-3">
              {isPremium ? (
                <motion.div
                  className="w-full py-3 rounded-full font-medium text-center"
                  style={{
                    background: `${theme.accent.primary}20`,
                    color: theme.accent.primary,
                    border: `1px solid ${theme.accent.primary}40`,
                  }}
                >
                  You&apos;re on Premium ({plan === 'yearly' ? 'Yearly' : 'Monthly'})
                </motion.div>
              ) : (
                <>
                  {/* Yearly - Primary */}
                  <motion.button
                    className="w-full py-3 rounded-full font-medium relative overflow-hidden disabled:opacity-50"
                    style={{
                      background: theme.accent.primary,
                      color: theme.bg.primary,
                      boxShadow: `0 0 30px ${theme.accent.primary}30`,
                    }}
                    whileHover={{ scale: checkoutLoading ? 1 : 1.02 }}
                    whileTap={{ scale: checkoutLoading ? 1 : 0.98 }}
                    onClick={() => handleCheckout('yearly')}
                    disabled={checkoutLoading !== null || isLoading}
                  >
                    {/* Pulse Effect */}
                    {!checkoutLoading && (
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{ background: theme.accent.warm }}
                        animate={{
                          scale: [1, 1.1, 1],
                          opacity: [0.3, 0, 0.3],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                    )}
                    <span className="relative z-10">
                      {checkoutLoading === 'yearly' ? 'Loading...' : 'Get Yearly — Best Value'}
                    </span>
                  </motion.button>

                  {/* Monthly - Secondary */}
                  <motion.button
                    className="w-full py-3 rounded-full font-medium transition-all disabled:opacity-50"
                    style={{
                      background: 'transparent',
                      border: `1px solid ${theme.glass.border}`,
                      color: theme.text.primary,
                    }}
                    whileHover={{
                      background: checkoutLoading ? 'transparent' : theme.glass.bg,
                      scale: checkoutLoading ? 1 : 1.02,
                    }}
                    whileTap={{ scale: checkoutLoading ? 1 : 0.98 }}
                    onClick={() => handleCheckout('monthly')}
                    disabled={checkoutLoading !== null || isLoading}
                  >
                    {checkoutLoading === 'monthly' ? 'Loading...' : 'Get Monthly — $4/mo'}
                  </motion.button>
                </>
              )}

              {/* Admin-only: smoke-test the live payment pipeline with a $1
                  charge. Shows regardless of Premium status (admins are already
                  Premium). The /api/checkout route re-checks isAdminEmail, so
                  this button is just a convenience — not the security boundary. */}
              {isAdmin && (
                <motion.button
                  className="w-full py-2.5 rounded-full text-sm font-medium transition-all disabled:opacity-50"
                  style={{
                    background: 'transparent',
                    border: `1px dashed ${theme.accent.primary}80`,
                    color: theme.accent.primary,
                  }}
                  whileHover={{ scale: checkoutLoading ? 1 : 1.02 }}
                  whileTap={{ scale: checkoutLoading ? 1 : 0.98 }}
                  onClick={() => handleCheckout('test')}
                  disabled={checkoutLoading !== null || isLoading}
                >
                  {checkoutLoading === 'test' ? 'Loading...' : '⚡ Test live payment ($1) · admin'}
                </motion.button>
              )}
            </div>
          </motion.div>
        </div>

        {/* FAQ Section */}
        <motion.div
          className="mt-20 max-w-2xl mx-auto"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h3
            className="text-2xl font-serif mb-8 text-center"
            style={{ color: theme.text.primary }}
          >
            Questions?
          </h3>

          <div className="space-y-6">
            {[
              {
                q: 'Do I need to save my writing?',
                a: "Never — there's no save button. Your journals, letters, and scrapbooks all save themselves quietly as you go.",
              },
              {
                q: 'Can I edit a journal entry after I write it?',
                a: "On the same day, freely — words, photos, song, mood, all of it. Once the day turns, that page gently seals: you can always read it, you just can't rewrite it. It keeps your journal an honest record of how you really felt.",
              },
              {
                q: 'Can I write more than one entry in a day?',
                a: "Each day holds a single page. It fills up as the day unfolds — add to it whenever you like — and seals softly when the day ends.",
              },
              {
                q: 'Can I edit or unsend a letter after I send it?',
                a: "Once a letter is sealed and on its way, it can't be changed or called back — that's part of the magic of a letter through time. While it's still a draft, though, you can edit it freely or delete it entirely.",
              },
              {
                q: "What if I send a letter to a friend who isn't on Meethril?",
                a: "That's perfectly fine — it arrives in their inbox as an email, no account needed. If the letter means something to them, they can save it and make a little Meethril of their own to keep it forever.",
              },
              {
                q: 'Who can I send letters to?',
                a: "Your future self, a friend, or — if you like — an anonymous stranger, who sends a kind note quietly back to you. Letters to yourself always travel forward in time, never back.",
              },
              {
                q: 'Can anyone at Meethril read my entries?',
                a: "No. Your journals, letters, scrapbooks, and photos are encrypted on your device before they ever reach us — we only ever hold the locked version. The key is yours alone.",
              },
              {
                q: 'What if I forget my daily key?',
                a: "When you first set up your journal, you're given a one-time recovery key — keep it somewhere safe. If your daily key ever slips your mind, that recovery key lets you back in and set a new one. Without either, not even we can unlock your entries — that's the price of true privacy.",
              },
              {
                q: 'Can I use Meethril on my phone?',
                a: "Yes — Meethril opens right in your phone's browser, so you can write from wherever you are.",
              },
              {
                q: 'What happens to my entries if I downgrade?',
                a: "Your entries are always yours. If you exceed the free limit, you can still read everything — you just can't create new ones until your next monthly window.",
              },
              {
                q: 'How many letters can I send?',
                a: 'Free includes 2 letters to your future self and 10 to friends each month. Premium raises that to 10 and 20 per month — and lets you ask a friend to save a copy of their letter.',
              },
              {
                q: 'Is there a trial for Premium?',
                a: "The free tier is your trial. Experience the core features, then upgrade when you want more room.",
              },
            ].map((faq, i) => (
              <motion.div
                key={i}
                className="p-5 rounded-xl"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <p
                  className="font-medium mb-2"
                  style={{ color: theme.text.primary }}
                >
                  {faq.q}
                </p>
                <p style={{ color: theme.text.secondary }}>{faq.a}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <motion.p
          className="text-center mt-16"
          style={{ color: theme.text.muted }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.6 }}
          viewport={{ once: true }}
        >
          Hearth — a meditative journal that listens
        </motion.p>
      </div>
    </main>
  )
}

// Regional crisis-line lookup. India (iCall) is the launch default.
// To add a locale: add an entry keyed by ISO country code, then surface it from the
// self-harm interstitial UX based on the user's locale or their last-known postmark.

export interface Helpline {
  name: string
  phone: string
  hours: string
  url?: string
}

const HELPLINES: Record<string, Helpline> = {
  IN: {
    name: 'iCall (India)',
    phone: '9152987821',
    hours: 'Mon–Sat, 8 AM – 10 PM',
    url: 'https://icallhelpline.org',
  },
  // Add US, UK, etc. as needed
}

export function helplineForCountry(countryCode: string | null | undefined): Helpline {
  if (countryCode && HELPLINES[countryCode.toUpperCase()]) {
    return HELPLINES[countryCode.toUpperCase()]
  }
  return HELPLINES.IN
}

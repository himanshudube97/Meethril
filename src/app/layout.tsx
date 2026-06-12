import type { Metadata, Viewport } from "next";
import {
  EB_Garamond,
  Caveat,
  Patrick_Hand,
} from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import LayoutContent from "@/components/LayoutContent";
import AuthGate from "@/components/AuthGate";
import AuthProvider from "@/components/AuthProvider";
import E2EEProvider from "@/components/e2ee/E2EEProvider";
import DesktopGate from "@/components/DesktopGate";
import ServiceWorkerRegistrar from "@/components/reminders/ServiceWorkerRegistrar";
import ComebackHost from "@/components/comeback/ComebackHost";
import { ProductTour } from "@/components/tour/product-tour";

const ebGaramond = EB_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

const patrickHand = Patrick_Hand({
  variable: "--font-patrick-hand",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow pinch-to-zoom for accessibility (WCAG 1.4.4). Earlier the viewport
  // pinned maximumScale: 1 + userScalable: false, which blocks low-vision
  // users from zooming and is a hard a11y violation.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f1a" },
  ],
};

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://meethril.com"
).replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Meethril — a hush at the end of the day, kept just for you",
  description:
    "Meethril is a quiet, end-to-end encrypted journaling web app. Write freely each evening, seal letters to your future self, keep scrapbooks — no streaks, no AI. Over time it gently shows you who you are.",
  applicationName: "Meethril",
  manifest: "/manifest.json",
  alternates: {
    canonical: SITE_URL,
  },

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Meethril",
  },

  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },

  openGraph: {
    title: "Meethril — a quieter place to think",
    description:
      "A quiet, end-to-end encrypted journaling app. Sealed letters to your future self, scrapbooks, and a gentle space to reflect — no streaks, no AI.",
    url: SITE_URL,
    siteName: "Meethril",
    type: "website",
    locale: "en_US",
    // images: omitted — opengraph-image.tsx auto-populates og:image.
  },

  twitter: {
    card: "summary_large_image",
    title: "Meethril — a quieter place to think",
    description:
      "A quiet, end-to-end encrypted journaling app. Sealed letters, scrapbooks, no streaks, no AI.",
    // images: omitted — twitter-image.tsx auto-populates twitter:image.
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${ebGaramond.variable} ${caveat.variable} ${patrickHand.variable} antialiased font-serif`}
      >
        <ServiceWorkerRegistrar />
        <ComebackHost />
        <AuthProvider>
          {/* Desktop-only gate: on phones/tablets this renders the splash
              INSTEAD of the app — placed above E2EEProvider so the E2EE modals
              and product tour (siblings of the page) are suppressed too. */}
          <DesktopGate>
            <E2EEProvider>
              <AuthGate>
                <LayoutContent>{children}</LayoutContent>
              </AuthGate>
              {/* Mounted once here (not inside LayoutContent's per-route branches)
                  so navigating between pages never unmounts a running walkthrough. */}
              <ProductTour />
            </E2EEProvider>
          </DesktopGate>
        </AuthProvider>
        {/* Vercel privacy-friendly analytics: cookieless pageviews + Web Vitals.
            No-ops outside Vercel hosting, so safe in local/Docker dev. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import {
  EB_Garamond,
  Caveat,
  Patrick_Hand,
} from "next/font/google";
import "./globals.css";
import LayoutContent from "@/components/LayoutContent";
import AuthGate from "@/components/AuthGate";
import AuthProvider from "@/components/AuthProvider";
import E2EEProvider from "@/components/e2ee/E2EEProvider";
import ServiceWorkerRegistrar from "@/components/reminders/ServiceWorkerRegistrar";
import ComebackHost from "@/components/comeback/ComebackHost";

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

export const metadata: Metadata = {
  title: "Meethril — a meditative journal that listens",
  description: "Write freely, and over time, it gently shows you who you are.",
  manifest: "/manifest.json",

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
    title: "Meethril",
    description: "A meditative journal that listens",
    siteName: "Meethril",
    type: "website",
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
          <E2EEProvider>
            <AuthGate>
              <LayoutContent>{children}</LayoutContent>
            </AuthGate>
          </E2EEProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

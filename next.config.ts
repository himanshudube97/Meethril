import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  // Disabled: public/sw.js is currently hand-written to host push-reminder handlers.
  // Re-enable when adopting full PWA install flow.
  disable: true,
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "image-cache",
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          },
        },
      },
      {
        urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "font-cache",
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["jose", "@prisma/client", ".prisma/client"],
  turbopack: {},
  async headers() {
    // Baseline security headers. CSP is intentionally omitted from this
    // first pass — locking it down requires walking the app for inline
    // scripts + the Next runtime, which is a separate task. Everything
    // here is safe to apply globally.
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            // camera=(self) so the in-app "Take Photo" capture (getUserMedia)
            // works on our own origin — `camera=()` blocked it for everyone,
            // surfacing as NotAllowedError even after the browser grants access.
            // mic + geolocation stay disabled; the app doesn't use them.
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
};

export default withPWA(nextConfig);

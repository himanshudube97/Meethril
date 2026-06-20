import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs";

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
  async redirects() {
    // /try is just an entry point — the real first screen is the writing desk.
    // Redirect at the routing layer (HTTP 307) instead of via a redirect() call
    // inside the page component: a render-time redirect() throws mid-render and
    // React 19's dev perf tracker then chokes on the aborted "TryPage" render
    // ("Failed to execute 'measure'… cannot have a negative time stamp" + a
    // follow-on insertBefore DOM error). A route redirect never renders the page.
    return [
      { source: '/try', destination: '/try/write', permanent: false },
    ]
  },
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

// Wrap with Sentry last so its webpack/turbopack plugin can upload source maps
// and instrument the build. Org/project/auth-token come from env; when they're
// absent (local dev) the plugin is a no-op and never uploads anything.
export default withSentryConfig(withPWA(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "meethril",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});

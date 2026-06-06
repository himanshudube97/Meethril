// Next.js instrumentation hook. Loads the right Sentry config per runtime and
// wires server-side request error capture. See:
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in Server Components, route handlers, and middleware.
export const onRequestError = Sentry.captureRequestError;

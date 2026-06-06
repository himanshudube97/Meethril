import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Hearth is a privacy-first, E2EE journaling app. Even though journal text,
 * letters, scrapbook items, photos and doodles are encrypted client-side
 * (the server only ever sees ciphertext), other request payloads carry real
 * PII in plaintext: recipient emails on letters, profile nickname/birthday,
 * stranger-note text (server-encrypted but plaintext in transit), auth cookies.
 *
 * Sentry's server SDK attaches the incoming request body by default. We never
 * want any request body, cookie, or auth header leaving the app inside an error
 * report — none of it helps debugging and all of it is sensitive. This scrubber
 * runs in every runtime (client/server/edge) via `beforeSend`.
 */
export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent {
  if (event.request) {
    // Request body — may contain emails, profile fields, note text, etc.
    delete event.request.data;
    // Query string — letter tokens, ids we don't need in error context.
    delete event.request.query_string;
    // Cookies carry the auth/session token.
    delete event.request.cookies;

    if (event.request.headers) {
      const headers = event.request.headers as Record<string, unknown>;
      delete headers["cookie"];
      delete headers["authorization"];
      delete headers["x-user-tz"];
    }
  }

  // Defensive: never ship identifying user fields. We only keep an opaque id
  // if one was set explicitly elsewhere; drop email/ip/username.
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }

  return event;
}

/**
 * Cross-origin connection hints rendered as real `<link>` tags by
 * `AppHtmlDocument`.
 *
 * Every app surface talks to `api.genfeed.ai` and `cdn.genfeed.ai` within the
 * first paint (session probe, brand mark, media). Without a preconnect the
 * browser only starts DNS + TCP + TLS when the first request is queued, which
 * measured at ~580ms for the API origin and ~320ms for the CDN on mobile —
 * straight onto LCP. Preconnect overlaps that handshake with document parsing.
 *
 * Keep this list short: each preconnect holds an open socket, so origins that
 * are not needed during the critical path belong in `DNS_PREFETCH_ORIGINS`
 * (name resolution only) or in neither list.
 */
export const PRECONNECT_ORIGINS = [
  'https://api.genfeed.ai',
  'https://cdn.genfeed.ai',
] as const;

/** Resolved early, connected on demand — notifications open after hydration. */
export const DNS_PREFETCH_ORIGINS = [
  'https://notifications.genfeed.ai',
] as const;

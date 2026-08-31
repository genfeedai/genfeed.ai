import * as Sentry from '@sentry/nextjs';
import { initWebsiteAnalytics } from './packages/analytics/posthog-client';

Sentry.init({
  debug: false,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV !== 'development',
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,

  // Browser-extension noise injected into the page (content scripts calling
  // chrome.runtime APIs against stale tab/worker contexts) — not our code.
  ignoreErrors: [
    /runtime\.sendMessage/i,
    /Extension context invalidated/i,
    /Could not establish connection\. Receiving end does not exist/i,
  ],

  // No Session Replay on the marketing site. `replayIntegration` is referenced
  // at module scope, so its rrweb recorder lands in the first client chunk that
  // `instrumentation-client` pulls in — bytes every visitor parses before the
  // hero paints, and the largest single removable item on this page's critical
  // path. Across a handful of static, server-rendered marketing pages a replay
  // adds little over the stack trace and breadcrumbs Sentry already sends.
  // The studio keeps error-triggered replay (`apps/app/instrumentation-client.ts`),
  // where reproducing an editor bug genuinely needs the session.

  // Sentry is used for error reporting only; performance spans are disabled.
  tracesSampleRate: 0,
});

// PostHog is the single tracker on the marketing site — cookieless, anonymous
// pageviews + CTA conversions. No-ops (and never loads posthog-js) when no
// build-time key is present. See packages/analytics/posthog-client.ts.
initWebsiteAnalytics();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

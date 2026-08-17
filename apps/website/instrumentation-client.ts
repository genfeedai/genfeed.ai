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

  integrations: [
    Sentry.replayIntegration({
      maskAllInputs: true,
      maskAllText: true,
    }),
  ],

  replaysOnErrorSampleRate: 1.0,

  replaysSessionSampleRate: 0.1,

  tracesSampleRate: 1,
});

// PostHog is the single tracker on the marketing site — cookieless, anonymous
// pageviews + CTA conversions. No-ops (and never loads posthog-js) when no
// build-time key is present. See packages/analytics/posthog-client.ts.
initWebsiteAnalytics();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

import * as Sentry from '@sentry/nextjs';
import { initAnalytics } from '@/lib/analytics';
import { dropUnhandledJsonApiObjectRejection } from '@/lib/sentry/drop-json-api-object-rejection';

Sentry.init({
  beforeSend(event, hint) {
    return dropUnhandledJsonApiObjectRejection(event, hint);
  },
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
    /Failed to register a ServiceWorker/i,
    /serwist\/sw\.js/i,
  ],

  integrations: [
    Sentry.replayIntegration({
      maskAllInputs: true,
      maskAllText: true,
    }),
  ],

  replaysOnErrorSampleRate: 1.0,

  // The studio is a heavy, long-lived editor surface — session replay on
  // every session is disproportionate overhead. Error-triggered replay only.
  replaysSessionSampleRate: 0,

  // Sentry is used for error reporting only; performance spans are disabled.
  tracesSampleRate: 0,
});

// Product analytics (Genfeed Cloud only). No-ops — and never loads posthog-js —
// in self-hosted or desktop builds. See src/lib/analytics/posthog-client.ts.
initAnalytics();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

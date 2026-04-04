import * as Sentry from '@sentry/nextjs';

Sentry.init({
  debug: false,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV !== 'development',
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,

  integrations: [Sentry.replayIntegration()],

  replaysOnErrorSampleRate: 1.0,

  replaysSessionSampleRate: 0.1,

  tracesSampleRate: 1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

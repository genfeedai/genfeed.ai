import { initSentry } from '@configs/sentry.config.base';

// The app server traces 5% of production requests so slow RSC renders (the
// admin layout, page data loaders) show up per route next to the API spans.
initSentry({
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0,
});

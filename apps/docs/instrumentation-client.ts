'use client';

import { buildDocsPosthogOptions } from './lib/analytics/posthog-client';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

/**
 * How long the browser may keep deferring the SDK before we load it anyway.
 * Long enough to clear first paint and hydration on a slow phone, short enough
 * that a reader who leaves quickly is still counted.
 */
const ANALYTICS_IDLE_TIMEOUT_MS = 3000;

/** Fallback delay for engines without `requestIdleCallback` (Safari). */
const ANALYTICS_IDLE_FALLBACK_MS = 1500;

interface IdleCapableWindow {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
}

/**
 * Defer analytics bootstrap past the work the reader is actually waiting on.
 *
 * This module runs as part of the initial client bundle, so an eager
 * `import('posthog-js')` puts the SDK request, its parse cost, and every
 * follow-up ingestion call inside the dependency graph Lighthouse simulates
 * for LCP. None of it is needed before a docs page is readable.
 */
function runWhenIdle(run: () => void): void {
  const requestIdle = (window as Window & IdleCapableWindow)
    .requestIdleCallback;

  if (typeof requestIdle === 'function') {
    requestIdle(run, { timeout: ANALYTICS_IDLE_TIMEOUT_MS });
    return;
  }

  window.setTimeout(run, ANALYTICS_IDLE_FALLBACK_MS);
}

/**
 * Next.js loads this module once in the browser. Community and self-hosted
 * builds without a project token never download the analytics SDK.
 */
if (
  POSTHOG_KEY &&
  /^phc_[A-Za-z0-9]+$/.test(POSTHOG_KEY) &&
  typeof window !== 'undefined'
) {
  runWhenIdle(() => {
    void import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(POSTHOG_KEY, buildDocsPosthogOptions(POSTHOG_HOST));
      })
      .catch(() => {
        // Analytics must never interfere with documentation navigation.
      });
  });
}

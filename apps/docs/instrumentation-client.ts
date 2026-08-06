'use client';

import { buildDocsPosthogOptions } from './lib/analytics/posthog-client';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

/**
 * Next.js loads this module once in the browser. Community and self-hosted
 * builds without a project token never download the analytics SDK.
 */
if (POSTHOG_KEY && typeof window !== 'undefined') {
  void import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY, buildDocsPosthogOptions(POSTHOG_HOST));
    })
    .catch(() => {
      // Analytics must never interfere with documentation navigation.
    });
}

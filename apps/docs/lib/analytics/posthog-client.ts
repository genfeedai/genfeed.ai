import type { PostHogConfig } from 'posthog-js';

/**
 * Anonymous, cookieless journey tracking for docs.genfeed.ai.
 *
 * Pageviews follow App Router history changes. Autocapture is intentionally
 * limited to anchors and buttons so form values, selected text, and copied
 * documentation content are never sent to PostHog.
 */
export function buildDocsPosthogOptions(
  apiHost: string,
): Partial<PostHogConfig> {
  return {
    api_host: apiHost,
    autocapture: {
      capture_copied_text: false,
      dom_event_allowlist: ['click'],
      element_allowlist: ['a', 'button'],
    },
    // Dead-click and web-vitals autocapture each pull a separate lazy bundle
    // from the PostHog asset CDN for signal we do not act on. Keep them off so
    // docs pages stay on a single analytics request.
    capture_dead_clicks: false,
    capture_pageleave: true,
    capture_performance: false,
    capture_pageview: 'history_change',
    cookieless_mode: 'always',
    defaults: '2026-05-30',
    disable_session_recording: true,
    // Surveys are unused here; skipping them avoids surveys.js + preact.
    disable_surveys: true,
    person_profiles: 'never',
  };
}

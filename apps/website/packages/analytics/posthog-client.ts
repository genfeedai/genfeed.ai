'use client';

import type { PostHog } from 'posthog-js';
import {
  deriveWebsiteEventsFromCta,
  type WebsiteAnalyticsEvent,
  type WebsiteCtaPayload,
} from './analytics-events';

/**
 * Gated PostHog client for the marketing website (genfeed.ai).
 *
 * PostHog is the single tracker on the public site — there is no Google
 * Analytics, GTM, or ad-pixel path. Analytics only activates when a
 * `NEXT_PUBLIC_POSTHOG_KEY` is baked into the build (the Vercel deploy
 * workflow injects it); community/self-hosted builds without a key never load
 * `posthog-js` and make no tracking request. The SDK is pulled in via dynamic
 * `import()` so its bytes stay off the critical path and never execute when
 * the gate is closed.
 *
 * Cookieless by design: `persistence: 'memory'` stores nothing on the
 * visitor's device (no cookies, no localStorage), which is what lets the
 * public site run without a consent banner. Visitors are never identified —
 * every event is anonymous.
 *
 * All capture calls are fire-and-forget: a failed SDK load or unreachable
 * ingestion endpoint must never block or throw into the visitor's navigation.
 */

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

/**
 * CTA clicks fired before the async SDK import resolves are buffered so
 * first-paint clicks (hero CTAs) are not lost. Bounded to keep a failed SDK
 * load from accumulating events forever.
 */
const MAX_PENDING_EVENTS = 20;

interface PendingEvent {
  event: WebsiteAnalyticsEvent;
  properties: WebsiteCtaPayload;
}

interface TrackedCtaEventDetail {
  trackingData?: WebsiteCtaPayload;
  trackingName?: string;
}

let client: PostHog | null = null;
let hasInitStarted = false;
const pendingEvents: PendingEvent[] = [];

/** True only when a PostHog key was baked into this build. */
export function isWebsiteAnalyticsEnabled(): boolean {
  return Boolean(POSTHOG_KEY);
}

/**
 * Capture a derived CTA analytics event. Buffers until the SDK has loaded;
 * no-ops entirely when analytics is disabled for this build.
 */
export function captureWebsiteAnalyticsEvent(
  event: WebsiteAnalyticsEvent,
  properties: WebsiteCtaPayload,
): void {
  if (!isWebsiteAnalyticsEnabled() || typeof window === 'undefined') {
    return;
  }

  if (!client) {
    if (pendingEvents.length < MAX_PENDING_EVENTS) {
      pendingEvents.push({ event, properties });
    }
    return;
  }

  try {
    client.capture(event, properties);
  } catch {
    // Fire-and-forget: a capture failure must never surface to the visitor.
  }
}

function flushPendingEvents(): void {
  if (!client) {
    return;
  }

  for (const pending of pendingEvents.splice(0)) {
    try {
      client.capture(pending.event, pending.properties);
    } catch {
      // Fire-and-forget.
    }
  }
}

/**
 * Bridge for `ButtonTracked` (shared UI): every tracked CTA dispatches a
 * `genfeed:marketing:button-click` CustomEvent, which is mapped to the
 * `cta_click` event plus its derived conversion intent.
 */
function handleTrackedCtaClick(event: Event): void {
  const detail = (event as CustomEvent<TrackedCtaEventDetail>).detail;

  if (!detail?.trackingName) {
    return;
  }

  const payload: WebsiteCtaPayload = {
    ...(detail.trackingData ?? {}),
    trackingName: detail.trackingName,
  };

  for (const name of deriveWebsiteEventsFromCta(payload)) {
    captureWebsiteAnalyticsEvent(name, payload);
  }
}

/**
 * Initialise website analytics once per page load. Safe to call on every
 * boot: it no-ops on the server, when disabled, or when already started.
 * Never awaited — initialisation is best-effort.
 */
export function initWebsiteAnalytics(): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (hasInitStarted || !isWebsiteAnalyticsEnabled()) {
    return;
  }
  hasInitStarted = true;

  window.addEventListener(
    'genfeed:marketing:button-click',
    handleTrackedCtaClick,
  );

  void import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY as string, {
        api_host: POSTHOG_HOST,
        // Explicit, taxonomy-driven events only — no clicked-element text.
        autocapture: false,
        // Capture $pageview on the initial load AND every App Router
        // (History API) navigation.
        capture_pageview: 'history_change',
        // Replay is a non-goal on the marketing site.
        disable_session_recording: true,
        // Anonymous-only traffic: no identify calls happen on the website,
        // so person profiles are never created.
        person_profiles: 'identified_only',
        // Cookieless: nothing persisted on the visitor's device. This is the
        // property that lets the public site track without a consent banner.
        persistence: 'memory',
      });
      client = posthog;
      flushPendingEvents();
    })
    .catch(() => {
      // Best-effort: a failed SDK load must never surface as a site error.
    });
}

/** Test-only hook to reset module singleton state between cases. */
export function __resetWebsiteAnalyticsForTests(): void {
  if (typeof window !== 'undefined') {
    window.removeEventListener(
      'genfeed:marketing:button-click',
      handleTrackedCtaClick,
    );
  }
  client = null;
  hasInitStarted = false;
  pendingEvents.length = 0;
}

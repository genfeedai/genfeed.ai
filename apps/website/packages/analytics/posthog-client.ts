'use client';

import type { BeforeSendFn, PostHog } from 'posthog-js';
import {
  deriveWebsiteEventsFromCta,
  type WebsiteAnalyticsEvent,
  type WebsiteAnalyticsEventProperties,
  type WebsiteCtaPayload,
} from './analytics-events';
import { runWhenIdle } from './run-when-idle';

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
 * Cookieless by design: PostHog's server-hash mode stores nothing on the
 * visitor's device (no cookies, localStorage, or sessionStorage), which is
 * what lets the public site run without a consent banner. Visitors are never
 * identified — every event is anonymous.
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

type PendingEvent = {
  [E in WebsiteAnalyticsEvent]: {
    event: E;
    properties: WebsiteAnalyticsEventProperties[E];
  };
}[WebsiteAnalyticsEvent];

interface TrackedCtaEventDetail {
  trackingData?: WebsiteCtaPayload;
  trackingName?: string;
}

let client: PostHog | null = null;
let hasInitStarted = false;
const pendingEvents: PendingEvent[] = [];

/** True only when a valid PostHog project token was baked into this build. */
export function isWebsiteAnalyticsEnabled(): boolean {
  return /^phc_[A-Za-z0-9]+$/.test(POSTHOG_KEY ?? '');
}

/**
 * Capture a derived CTA analytics event. Buffers until the SDK has loaded;
 * no-ops entirely when analytics is disabled for this build.
 */
export function captureWebsiteAnalyticsEvent<E extends WebsiteAnalyticsEvent>(
  event: E,
  properties: WebsiteAnalyticsEventProperties[E],
): void {
  if (!isWebsiteAnalyticsEnabled() || typeof window === 'undefined') {
    return;
  }

  if (!client) {
    if (pendingEvents.length < MAX_PENDING_EVENTS) {
      pendingEvents.push({ event, properties } as PendingEvent);
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

const SENSITIVE_QUERY_PATTERN =
  /(?:[?&#]|%3f|%26|%23)(?:ref|previewToken)(?:=|%3d)/i;
const MAX_PROPERTY_DEPTH = 6;

function scrubWebsiteAnalyticsValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    if (!/^(?:https?:\/\/|\/)/i.test(value)) {
      return SENSITIVE_QUERY_PATTERN.test(value) ? undefined : value;
    }
    try {
      const url = new URL(value, window.location.origin);
      let changed = false;
      for (const key of Array.from(url.searchParams.keys())) {
        if (
          /^(?:ref|previewToken)$/i.test(key) ||
          url.searchParams
            .getAll(key)
            .some((item) => SENSITIVE_QUERY_PATTERN.test(item))
        ) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (SENSITIVE_QUERY_PATTERN.test(url.hash)) {
        url.hash = '';
        changed = true;
      }
      if (!changed) return value;
      return value.startsWith('/') && !value.startsWith('//')
        ? `${url.pathname}${url.search}${url.hash}`
        : url.toString();
    } catch {
      return SENSITIVE_QUERY_PATTERN.test(value) ? undefined : value;
    }
  }
  if (value === null || typeof value !== 'object') return value;
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  if (depth >= MAX_PROPERTY_DEPTH) return undefined;
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const scrubbed = scrubWebsiteAnalyticsValue(item, depth + 1);
      return scrubbed === undefined ? [] : [scrubbed];
    });
  }
  const scrubbed: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:ref|previewToken)$/i.test(key)) continue;
    const safeValue = scrubWebsiteAnalyticsValue(item, depth + 1);
    if (safeValue !== undefined) scrubbed[key] = safeValue;
  }
  return scrubbed;
}

/** Exclude signed previews and keep referral credentials out of SDK URL properties. */
const protectWebsiteAnalytics: BeforeSendFn = (event) => {
  if (!event) return event;
  if (new URLSearchParams(window.location.search).has('previewToken'))
    return null;
  const currentUrl = event.properties?.$current_url;
  if (typeof currentUrl === 'string') {
    try {
      if (new URL(currentUrl).searchParams.has('previewToken')) return null;
    } catch {
      /* Ignore a malformed SDK URL. */
    }
  }
  event.properties = scrubWebsiteAnalyticsValue(
    event.properties,
  ) as typeof event.properties;
  if (event.$set) {
    event.$set = scrubWebsiteAnalyticsValue(event.$set) as typeof event.$set;
  }
  if (event.$set_once) {
    event.$set_once = scrubWebsiteAnalyticsValue(
      event.$set_once,
    ) as typeof event.$set_once;
  }
  return event;
};

/** Pull in `posthog-js` and start it with the marketing configuration. */
function loadWebsiteAnalyticsSdk(): void {
  void import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY as string, {
        api_host: POSTHOG_HOST,
        before_send: protectWebsiteAnalytics,
        // Flags requests bypass before_send and include the unsanitized page
        // context. This site uses no flags; capture/vitals are configured here.
        advanced_disable_flags: true,
        // Capture every semantic navigation/action control while avoiding
        // form values and copied text. Explicit CTA events below add the
        // stable conversion taxonomy on top of this journey-level signal.
        autocapture: {
          capture_copied_text: false,
          dom_event_allowlist: ['click'],
          element_allowlist: ['a', 'button'],
        },
        // Dead-click autocapture ships as a separate lazy bundle fetched from
        // the PostHog asset CDN. It adds no signal we act on and its request
        // sits on the marketing critical path — keep it off.
        capture_dead_clicks: false,
        // CrUX aggregates by origin and cannot separate the landing pages from
        // the article and use-case routes, so per-route field vitals come from
        // here. Network timing stays off: it reports every resource URL.
        // Attribution is off for the same reason — it attaches the LCP
        // element's URL (query string included) and the interaction target's
        // selector to every vitals event.
        capture_performance: {
          network_timing: false,
          web_vitals: true,
          web_vitals_attribution: false,
        },
        // Capture $pageview on the initial load AND every App Router
        // (History API) navigation.
        capture_pageview: 'history_change',
        capture_pageleave: true,
        cookieless_mode: 'always',
        defaults: '2026-05-30',
        // Replay is a non-goal on the marketing site.
        disable_session_recording: true,
        // Surveys are not used on the public site; skipping them avoids
        // loading surveys.js and its bundled preact runtime.
        disable_surveys: true,
        // Public traffic is anonymous-only; never create person profiles.
        person_profiles: 'never',
      });
      client = posthog;
      flushPendingEvents();
    })
    .catch(() => {
      // Best-effort: a failed SDK load must never surface as a site error.
    });
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

  runWhenIdle(loadWebsiteAnalyticsSdk);
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

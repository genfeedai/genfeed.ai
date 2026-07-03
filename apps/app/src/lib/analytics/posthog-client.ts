'use client';

import type { PostHog } from 'posthog-js';
import { isCloudConnected } from '@/lib/config/edition';
import { isDesktopShell } from '@/lib/desktop/runtime';
import type {
  AnalyticsEvent,
  AnalyticsEventProperties,
} from './analytics-events';

/**
 * Gated PostHog client for Genfeed Cloud product analytics (issue #1178).
 *
 * Hard privacy boundary: analytics only ever activates inside the cloud
 * deployment boundary. In self-hosted (Community) and desktop builds the client
 * is never constructed, no script is loaded, and no network request is made —
 * this is a privacy commitment, not an operator-managed toggle. `posthog-js` is
 * pulled in via a dynamic `import()` so its bytes never execute (and are
 * code-split out of the critical path) unless the gate resolves to enabled.
 *
 * All capture calls are fire-and-forget and defensively wrapped: a failed load,
 * unreachable ingestion endpoint, or SDK error must never block, delay, or throw
 * into the user-facing action being tracked, and must never reach Sentry.
 */

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let client: PostHog | null = null;
let hasInitStarted = false;

/**
 * True only when the app is a cloud-connected, non-desktop build with a
 * PostHog key present. Resolved fresh so tests can flip env/mode between cases;
 * in production the inputs are fixed for the lifetime of the session.
 */
export function isAnalyticsEnabled(): boolean {
  return Boolean(POSTHOG_KEY) && isCloudConnected() && !isDesktopShell();
}

/**
 * Initialise the PostHog client once, only when analytics is enabled. Safe to
 * call on every app boot: it no-ops on the server, when disabled, or when
 * already initialised. Never awaited by callers — initialisation is best-effort.
 */
export function initAnalytics(): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (hasInitStarted || !isAnalyticsEnabled()) {
    return;
  }
  hasInitStarted = true;

  void import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY as string, {
        api_host: POSTHOG_HOST,
        // Explicit, custom-event product analytics only. Autocapture is off so
        // no clicked element text (post titles, generated copy) can ever leak
        // into events, and session recording is off (a non-goal of #1178).
        autocapture: false,
        capture_pageview: true,
        disable_session_recording: true,
        // Only build person profiles once a user is identified — keeps
        // anonymous, self-serve traffic out of person-based billing/analytics.
        person_profiles: 'identified_only',
      });
      client = posthog;
    })
    .catch(() => {
      // Best-effort: swallow load/init failures so analytics can never surface
      // as an application error.
    });
}

/**
 * Capture a typed product-analytics event. No-ops entirely when the client is
 * not initialised (i.e. every non-cloud build). Property shapes are enforced by
 * {@link AnalyticsEventProperties}; free-text values are structurally excluded.
 */
export function captureAnalyticsEvent<E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEventProperties[E],
): void {
  if (!client) {
    return;
  }
  try {
    client.capture(event, properties);
  } catch {
    // Fire-and-forget: a capture failure must never block the tracked action.
  }
}

/**
 * Associate subsequent events with an organization group. Called from the
 * authenticated shell once an org id is known. No PII — the id is an opaque
 * identifier the client already holds.
 */
export function identifyAnalyticsOrganization(organizationId: string): void {
  if (!client || !organizationId) {
    return;
  }
  try {
    client.group('organization', organizationId);
  } catch {
    // Best-effort grouping.
  }
}

/** Clear the current user/group association (e.g. on sign-out). */
export function resetAnalytics(): void {
  if (!client) {
    return;
  }
  try {
    client.reset();
  } catch {
    // Best-effort reset.
  }
}

/** Test-only hook to reset module singleton state between cases. */
export function __resetAnalyticsForTests(): void {
  client = null;
  hasInitStarted = false;
}

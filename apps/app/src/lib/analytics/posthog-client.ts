'use client';

import { isSaaS } from '@genfeedai/config/deployment';
import type { CaptureResult, PostHog } from 'posthog-js';
import type {
  AnalyticsEvent,
  AnalyticsEventProperties,
} from './analytics-events';
import { sanitizeAnalyticsUrl } from './analytics-url';

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
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

let client: PostHog | null = null;
let hasInitStarted = false;
let pendingIdentity: AnalyticsUserIdentity | null = null;
let unsubscribeFromFeatureFlags: (() => void) | null = null;

export interface AnalyticsUserIdentity {
  id: string;
  isInternal: boolean;
}

export type AnalyticsFeatureFlagValues = Record<string, boolean>;
export type AnalyticsFeatureFlagListener = (
  values: AnalyticsFeatureFlagValues,
) => void;

interface AnalyticsFeatureFlagSubscription {
  keys: readonly string[];
  listener: AnalyticsFeatureFlagListener;
}

const featureFlagSubscriptions = new Set<AnalyticsFeatureFlagSubscription>();

/**
 * True only when the app is a cloud-connected, non-desktop build with a
 * PostHog key present. Resolved fresh so tests can flip env/mode between cases;
 * in production the inputs are fixed for the lifetime of the session.
 */
export function isAnalyticsEnabled(): boolean {
  return Boolean(POSTHOG_KEY) && isSaaS();
}

/**
 * Property keys that can hold free-text (page titles, search terms) and must
 * never leave the client (issue #1178, FR8). `title` is `document.title` on
 * $pageview; `utm_term`/`ph_keyword` are free-text search-campaign params.
 */
const FREE_TEXT_PROPERTY_KEYS = new Set([
  'description',
  'label',
  'name',
  'ph_keyword',
  'title',
  'utm_term',
]);
const SENSITIVE_PROPERTY_KEY_PATTERN =
  /(content|credential|message|prompt|secret|text|token)/i;
/** A property value worth sanitising as a URL: absolute or path-relative. */
const URL_LIKE_RE = /^(?:https?:\/\/|\/)/;
/** Bound on recursion into nested property bags ($set/$set_once/$groups). */
const MAX_SCRUB_DEPTH = 6;

function isDateObject(value: object): boolean {
  return Object.prototype.toString.call(value) === '[object Date]';
}

/**
 * Recursively reduce a property value to its privacy-safe form: URL-bearing
 * strings become bounded route templates; everything else passes through.
 * Plain objects/arrays are copied while nested $set/$set_once payloads are
 * scrubbed, so analytics cannot mutate application-owned state by reference.
 */
function scrubPropertyValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    return URL_LIKE_RE.test(value) ? sanitizeAnalyticsUrl(value) : value;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_SCRUB_DEPTH) {
    if (Array.isArray(value)) {
      return [];
    }
    return isDateObject(value) ? value : {};
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubPropertyValue(item, depth + 1));
  }
  if (isDateObject(value)) {
    return value;
  }
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return {};
  }
  const record = value as Record<string, unknown>;
  const scrubbed: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (
      FREE_TEXT_PROPERTY_KEYS.has(key.toLowerCase()) ||
      SENSITIVE_PROPERTY_KEY_PATTERN.test(key)
    ) {
      continue;
    }
    scrubbed[key] = scrubPropertyValue(record[key], depth + 1);
  }
  return scrubbed;
}

/**
 * `before_send` hook — the final-payload scrub applied to every outbound event.
 * Runs after PostHog has assembled all auto-properties ($current_url, $referrer,
 * $pathname, $initial_current_url, document.title, …) and person $set/$set_once
 * bags, so it is the one place that guarantees no free-text or raw tenant URL
 * ever reaches ingestion. `sanitize_properties` is deprecated in posthog-js and
 * does not see the final $set, so it is deliberately not used.
 */
function scrubEventProperties(
  event: CaptureResult | null,
): CaptureResult | null {
  if (event?.properties) {
    event.properties = scrubPropertyValue(
      event.properties,
      0,
    ) as typeof event.properties;
  }
  return event;
}

function applyPendingIdentity(): void {
  if (!(client && pendingIdentity)) {
    return;
  }

  client.identify(pendingIdentity.id, {
    is_internal: pendingIdentity.isInternal,
  });
}

function resolveFeatureFlags(
  keys: readonly string[],
  errorsLoading = false,
): AnalyticsFeatureFlagValues {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      !errorsLoading &&
        client?.getFeatureFlagResult(key, { send_event: false })?.enabled ===
          true,
    ]),
  );
}

function notifyFeatureFlagSubscriptions(errorsLoading = false): void {
  for (const subscription of featureFlagSubscriptions) {
    subscription.listener(
      resolveFeatureFlags(subscription.keys, errorsLoading),
    );
  }
}

function ensureFeatureFlagSubscription(): void {
  if (
    !client ||
    unsubscribeFromFeatureFlags ||
    featureFlagSubscriptions.size === 0
  ) {
    return;
  }

  unsubscribeFromFeatureFlags = client.onFeatureFlags(
    (_flags, _variants, context) => {
      notifyFeatureFlagSubscriptions(context?.errorsLoading === true);
    },
  );
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
        // Last-mile privacy scrub (issue #1178, FR8): reduce every outbound
        // event's URL-bearing properties to bounded route templates and drop
        // free-text keys. Required now that pageviews capture in-app navigation.
        before_send: scrubEventProperties,
        // Capture $pageview on the initial load AND every App Router (History
        // API) navigation. Plain `true` fires only once at init and then goes
        // silent for client-side navigation, hiding in-app page usage.
        capture_pageview: 'history_change',
        // Keep replay hard-off: $snapshot bypasses before_send property
        // scrubbing, so enabling it would break the FR8 privacy boundary.
        disable_session_recording: true,
        // Only build person profiles once a user is identified — keeps
        // anonymous, self-serve traffic out of person-based billing/analytics.
        person_profiles: 'identified_only',
      });
      client = posthog;
      applyPendingIdentity();
      ensureFeatureFlagSubscription();
    })
    .catch(() => {
      // Best-effort: swallow load/init failures so analytics can never surface
      // as an application error.
    });
}

/**
 * Identify the authenticated account before evaluating person-targeted flags.
 * Only the canonical user id and an internal-account boolean leave the client;
 * email addresses and other profile fields remain private.
 */
export function identifyAnalyticsUser(identity: AnalyticsUserIdentity): void {
  if (!identity.id) {
    return;
  }

  pendingIdentity = identity;
  applyPendingIdentity();
}

/**
 * Subscribe to PostHog boolean flags without coupling shared UI packages to the
 * PostHog SDK. Missing flags and loading failures resolve false (fail closed).
 */
export function subscribeAnalyticsFeatureFlags(
  keys: readonly string[],
  listener: AnalyticsFeatureFlagListener,
): () => void {
  const subscription = { keys, listener };
  featureFlagSubscriptions.add(subscription);
  ensureFeatureFlagSubscription();

  return () => {
    featureFlagSubscriptions.delete(subscription);

    if (featureFlagSubscriptions.size === 0 && unsubscribeFromFeatureFlags) {
      unsubscribeFromFeatureFlags();
      unsubscribeFromFeatureFlags = null;
    }
  };
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
  pendingIdentity = null;
  if (!client) {
    return;
  }
  try {
    client.reset();
    notifyFeatureFlagSubscriptions(true);
  } catch {
    // Best-effort reset.
  }
}

/** Test-only hook to reset module singleton state between cases. */
export function __resetAnalyticsForTests(): void {
  unsubscribeFromFeatureFlags?.();
  client = null;
  hasInitStarted = false;
  pendingIdentity = null;
  unsubscribeFromFeatureFlags = null;
  featureFlagSubscriptions.clear();
}

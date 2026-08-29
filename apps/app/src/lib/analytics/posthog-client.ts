'use client';

import { isSaaS } from '@genfeedai/config/deployment';
import { logger } from '@services/core/logger.service';
import type {
  CaptureResult,
  PostHogInterface,
  RequestResponse,
} from 'posthog-js';
import {
  ANALYTICS_EVENTS,
  type AnalyticsEvent,
  type AnalyticsEventProperties,
} from './analytics-events';
import { sanitizeAnalyticsUrl } from './analytics-url';
import {
  type BrandOsFunnelStage,
  claimBrandOsFunnelStage,
  hasAcceptedBrandOsDraft,
  markBrandOsDraftAccepted,
} from './brand-os-funnel-dedupe';

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
  process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

interface PendingPageview {
  key: string;
  url: string;
}

interface PendingAnalyticsEvent {
  attempts: number;
  event: AnalyticsEvent;
  onceKey: string | null;
  properties: AnalyticsEventProperties[AnalyticsEvent];
}

let client: PostHogInterface | null = null;
let hasInitStarted = false;
let lastCapturedPageviewKey: string | null = null;
let pendingIdentity: AnalyticsUserIdentity | null = null;
// undefined = no instruction, null = explicit clear, string = active group.
let pendingOrganizationId: string | null | undefined;
let pendingPageview: PendingPageview | null = null;
let pendingEventRetryTimer: number | null = null;
let hasHydratedPendingEvents = false;
let shouldEnsureAnonymous = false;
let shouldResetAnalytics = false;
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
const pendingAnalyticsEvents: PendingAnalyticsEvent[] = [];
const pendingOnceKeys = new Set<string>();
const capturedOnceKeys = new Set<string>();

/**
 * SDK bootstrap is deliberately deferred, so every product capture must survive
 * the interval between the user action and the dynamic import resolving.
 */
const MAX_PENDING_ANALYTICS_EVENTS = 100;
const MAX_CAPTURE_RETRIES = 2;
const CAPTURE_RETRY_DELAY_MS = 1000;
const ONCE_STORAGE_PREFIX = 'genfeed.analytics.once.v1';
const PENDING_EVENTS_STORAGE_KEY = 'genfeed.analytics.pending.v1';

const FIRST_ONLY_ANALYTICS_EVENTS: ReadonlySet<AnalyticsEvent> = new Set([
  ANALYTICS_EVENTS.FIRST_CREDIT_PURCHASED,
  ANALYTICS_EVENTS.FIRST_SUCCESSFUL_PUBLISH,
  ANALYTICS_EVENTS.ONBOARDING_COMPLETED,
]);

/**
 * True only when the app is a cloud-connected, non-desktop build with a
 * valid PostHog project token. Resolved fresh so tests can flip env/mode
 * between cases; in production the inputs are fixed for the lifetime of the
 * session.
 */
export function isAnalyticsEnabled(): boolean {
  return /^phc_[A-Za-z0-9]+$/.test(POSTHOG_KEY ?? '') && isSaaS();
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
  /(billing|card|completion|content|cookie|credential|cvv|email|message|password|payment|prompt|secret|stripe|text|token)/i;
const EMAIL_LIKE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CREDENTIAL_LIKE_RE =
  /^(?:bearer\s+|eyJ[A-Za-z0-9_-]+\.|p(?:hc|hx)_[A-Za-z0-9]+|(?:pk|sk)_(?:live|test)_[A-Za-z0-9]+|(?:cs|pi|pm|seti|src|tok)_[A-Za-z0-9_]+$)/i;
const PAYMENT_CARD_LIKE_RE = /^\d{13,19}$/;
/** A property value worth sanitising as a URL: absolute or path-relative. */
const URL_LIKE_RE = /^(?:https?:\/\/|\/)/;
/** Bound on recursion into nested property bags ($set/$set_once/$groups). */
const MAX_SCRUB_DEPTH = 6;
const BLOCKED_PROPERTY_VALUE = Symbol('blocked-analytics-property');

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
    if (
      EMAIL_LIKE_RE.test(value) ||
      CREDENTIAL_LIKE_RE.test(value) ||
      PAYMENT_CARD_LIKE_RE.test(value)
    ) {
      return BLOCKED_PROPERTY_VALUE;
    }
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
    return value.flatMap((item) => {
      const scrubbed = scrubPropertyValue(item, depth + 1);
      return scrubbed === BLOCKED_PROPERTY_VALUE ? [] : [scrubbed];
    });
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
    const scrubbedValue = scrubPropertyValue(record[key], depth + 1);
    if (scrubbedValue !== BLOCKED_PROPERTY_VALUE) {
      scrubbed[key] = scrubbedValue;
    }
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

type AnalyticsDeliveryFailureCode =
  | 'posthog_capture_failed'
  | 'posthog_capture_retry_exhausted'
  | 'posthog_init_failed'
  | 'posthog_pending_queue_full'
  | 'posthog_request_failed';

function reportAnalyticsDeliveryFailure(
  code: AnalyticsDeliveryFailureCode,
  context: { event?: AnalyticsEvent; statusCode?: number } = {},
): void {
  logger.error('PostHog analytics delivery failed', {
    code,
    ...context,
    reportToSentry: false,
  });
}

function reportPostHogRequestFailure(response: RequestResponse): void {
  reportAnalyticsDeliveryFailure('posthog_request_failed', {
    statusCode: response.statusCode,
  });
}

function resolveOnceKey(event: AnalyticsEvent): string | null {
  if (!(pendingIdentity && FIRST_ONLY_ANALYTICS_EVENTS.has(event))) {
    return null;
  }

  return `${ONCE_STORAGE_PREFIX}:${encodeURIComponent(pendingIdentity.id)}:${event}`;
}

function hasCapturedOnce(onceKey: string): boolean {
  if (capturedOnceKeys.has(onceKey)) {
    return true;
  }

  try {
    return window.localStorage.getItem(onceKey) === '1';
  } catch {
    return false;
  }
}

function rememberCapturedOnce(onceKey: string): void {
  capturedOnceKeys.add(onceKey);
  try {
    window.localStorage.setItem(onceKey, '1');
  } catch {
    // In-memory deduplication still protects this browser session.
  }
}

function isStoredPendingEvent(value: unknown): value is PendingAnalyticsEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<PendingAnalyticsEvent>;
  return (
    typeof candidate.attempts === 'number' &&
    Number.isInteger(candidate.attempts) &&
    candidate.attempts >= 0 &&
    typeof candidate.event === 'string' &&
    Object.values(ANALYTICS_EVENTS).includes(candidate.event) &&
    (candidate.onceKey === null || typeof candidate.onceKey === 'string') &&
    Boolean(
      candidate.properties &&
        typeof candidate.properties === 'object' &&
        !Array.isArray(candidate.properties),
    )
  );
}

function persistPendingAnalyticsEvents(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (pendingAnalyticsEvents.length === 0) {
      window.sessionStorage.removeItem(PENDING_EVENTS_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      PENDING_EVENTS_STORAGE_KEY,
      JSON.stringify(pendingAnalyticsEvents),
    );
  } catch {
    // The in-memory queue remains available when browser storage is blocked.
  }
}

function hydratePendingAnalyticsEvents(): void {
  if (hasHydratedPendingEvents || typeof window === 'undefined') {
    return;
  }
  hasHydratedPendingEvents = true;

  try {
    const serialized = window.sessionStorage.getItem(
      PENDING_EVENTS_STORAGE_KEY,
    );
    if (!serialized) {
      return;
    }

    const stored = JSON.parse(serialized) as unknown;
    if (!Array.isArray(stored)) {
      window.sessionStorage.removeItem(PENDING_EVENTS_STORAGE_KEY);
      return;
    }

    for (const candidate of stored.slice(0, MAX_PENDING_ANALYTICS_EVENTS)) {
      if (!isStoredPendingEvent(candidate)) {
        continue;
      }

      const onceKey = candidate.onceKey;
      if (
        onceKey &&
        (pendingOnceKeys.has(onceKey) || hasCapturedOnce(onceKey))
      ) {
        continue;
      }

      pendingAnalyticsEvents.push({
        ...candidate,
        properties: scrubPropertyValue(
          candidate.properties,
          0,
        ) as PendingAnalyticsEvent['properties'],
      });
      if (onceKey) {
        pendingOnceKeys.add(onceKey);
      }
    }
    persistPendingAnalyticsEvents();
  } catch {
    try {
      window.sessionStorage.removeItem(PENDING_EVENTS_STORAGE_KEY);
    } catch {
      // Storage is unavailable; nothing else to clear.
    }
  }
}

function createPendingAnalyticsEvent<E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEventProperties[E],
): PendingAnalyticsEvent {
  return {
    attempts: 0,
    event,
    onceKey: resolveOnceKey(event),
    properties: scrubPropertyValue(
      properties,
      0,
    ) as AnalyticsEventProperties[AnalyticsEvent],
  };
}

function enqueuePendingAnalyticsEvent(pending: PendingAnalyticsEvent): void {
  if (
    pending.onceKey &&
    (pendingOnceKeys.has(pending.onceKey) || hasCapturedOnce(pending.onceKey))
  ) {
    return;
  }

  if (pendingAnalyticsEvents.length >= MAX_PENDING_ANALYTICS_EVENTS) {
    reportAnalyticsDeliveryFailure('posthog_pending_queue_full', {
      event: pending.event,
    });
    return;
  }

  pendingAnalyticsEvents.push(pending);
  if (pending.onceKey) {
    pendingOnceKeys.add(pending.onceKey);
  }
  persistPendingAnalyticsEvents();
}

function deliverAnalyticsEvent(pending: PendingAnalyticsEvent): boolean {
  if (!client) {
    return false;
  }
  if (pending.onceKey && hasCapturedOnce(pending.onceKey)) {
    pendingOnceKeys.delete(pending.onceKey);
    return true;
  }

  try {
    client.capture(pending.event, pending.properties);
    if (pending.onceKey) {
      pendingOnceKeys.delete(pending.onceKey);
      rememberCapturedOnce(pending.onceKey);
    }
    return true;
  } catch {
    reportAnalyticsDeliveryFailure('posthog_capture_failed', {
      event: pending.event,
    });
    return false;
  }
}

function schedulePendingEventRetry(): void {
  if (
    pendingEventRetryTimer !== null ||
    pendingAnalyticsEvents.length === 0 ||
    !client
  ) {
    return;
  }

  pendingEventRetryTimer = window.setTimeout(() => {
    pendingEventRetryTimer = null;
    flushPendingAnalyticsEvents();
  }, CAPTURE_RETRY_DELAY_MS);
}

function flushPendingAnalyticsEvents(): void {
  if (!client || pendingAnalyticsEvents.length === 0) {
    return;
  }
  if (pendingEventRetryTimer !== null) {
    window.clearTimeout(pendingEventRetryTimer);
    pendingEventRetryTimer = null;
  }

  const pendingBatch = pendingAnalyticsEvents.splice(0);
  for (const [index, pending] of pendingBatch.entries()) {
    if (deliverAnalyticsEvent(pending)) {
      continue;
    }

    pending.attempts += 1;
    if (pending.attempts <= MAX_CAPTURE_RETRIES) {
      pendingAnalyticsEvents.unshift(pending, ...pendingBatch.slice(index + 1));
      persistPendingAnalyticsEvents();
      schedulePendingEventRetry();
      return;
    }

    if (pending.onceKey) {
      pendingOnceKeys.delete(pending.onceKey);
    }
    reportAnalyticsDeliveryFailure('posthog_capture_retry_exhausted', {
      event: pending.event,
    });
  }

  persistPendingAnalyticsEvents();
}

function clearPendingAnalyticsEvents(): void {
  if (pendingEventRetryTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(pendingEventRetryTimer);
  }
  pendingEventRetryTimer = null;
  pendingAnalyticsEvents.length = 0;
  pendingOnceKeys.clear();
  persistPendingAnalyticsEvents();
}

function applyPendingIdentity(): void {
  if (!(client && pendingIdentity)) {
    return;
  }

  try {
    client.identify(pendingIdentity.id, {
      is_internal: pendingIdentity.isInternal,
    });
  } catch {
    // Best-effort identify. Must not block later organization/pageview apply.
  }
}

function applyPendingOrganization(): void {
  if (!client || pendingOrganizationId === undefined) {
    return;
  }

  try {
    if (pendingOrganizationId === null) {
      client.resetGroups();
      return;
    }

    client.group('organization', pendingOrganizationId);
  } catch {
    // Best-effort organization state.
  }
}

function applyPendingReset(): void {
  if (!client || !shouldResetAnalytics) {
    return;
  }

  shouldResetAnalytics = false;
  try {
    client.reset();
    notifyFeatureFlagSubscriptions(true);
  } catch {
    // Best-effort reset.
  }
}

function applyPendingPageview(): void {
  if (!client || !pendingPageview) {
    return;
  }

  const pageview = pendingPageview;
  pendingPageview = null;
  if (pageview.key === lastCapturedPageviewKey) {
    return;
  }

  try {
    client.capture('$pageview', { $current_url: pageview.url });
    lastCapturedPageviewKey = pageview.key;
  } catch {
    // Best-effort pageview capture.
  }
}

function applyPendingAnonymousState(): void {
  if (!client || !shouldEnsureAnonymous) {
    return;
  }

  shouldEnsureAnonymous = false;
  try {
    if (client.get_property('$user_id')) {
      client.reset();
      notifyFeatureFlagSubscriptions(true);
      return;
    }

    if (Object.keys(client.getGroups()).length > 0) {
      client.resetGroups();
    }
  } catch {
    // Best-effort anonymous-state reconciliation.
  }
}

function resolveFeatureFlags(
  keys: readonly string[],
  errorsLoading = false,
): AnalyticsFeatureFlagValues {
  const activeClient = client;
  if (errorsLoading || !activeClient) {
    return {};
  }

  return Object.fromEntries(
    keys.flatMap((key) => {
      const enabled = activeClient.getFeatureFlagResult(key, {
        send_event: false,
      })?.enabled;

      return typeof enabled === 'boolean' ? [[key, enabled]] : [];
    }),
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
 * Bind the SDK and flush queued lifecycle instructions. Used as `loaded` so
 * reset/identify run before PostHog starts its request queue, and again after
 * `init()` so test doubles that skip `loaded` still apply pending state.
 */
function bindClientAndApplyPending(posthog: PostHogInterface): void {
  client = posthog;
  applyPendingReset();
  applyPendingAnonymousState();
  applyPendingIdentity();
  applyPendingOrganization();
  applyPendingPageview();
  flushPendingAnalyticsEvents();
  ensureFeatureFlagSubscription();
}

/**
 * How long the browser may keep deferring the SDK before we load it anyway.
 * Long enough to clear first paint and hydration on a slow phone, short enough
 * that a visitor who leaves quickly is still counted.
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
 * Defer analytics bootstrap past the work the visitor is actually waiting on.
 *
 * `instrumentation-client` runs as part of the initial client bundle, so an
 * eager `import('posthog-js')` puts the SDK request, its parse cost, and every
 * follow-up ingestion call inside the dependency graph Lighthouse simulates for
 * LCP. None of it is needed before the page is usable.
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

/** Pull in `posthog-js` and start it with the product configuration. */
function loadAnalyticsSdk(): void {
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
        // Dead-click autocapture reads clicked element context, which the FR8
        // boundary keeps out of events anyway, and pulls a separate lazy bundle
        // from the PostHog asset CDN on first paint. Keep it off.
        capture_dead_clicks: false,
        // CrUX cannot see an authenticated product surface and cannot be split
        // by route, organization, or deploy, so field vitals have to come from
        // here. Network timing stays off: it reports per-resource URLs, which
        // sit outside the FR8 property boundary that before_send enforces.
        capture_performance: {
          network_timing: false,
          web_vitals: true,
        },
        // Route components capture pageviews only after auth and organization
        // scope is synchronized. SDK history capture runs inside pushState,
        // before React can apply the destination tenant scope.
        capture_pageview: false,
        // Manual pageviews still need $pageleave so session/bounce duration
        // stays instrumented. The SDK default is `if_capture_pageview`, which
        // would stay off when capture_pageview is false.
        capture_pageleave: true,
        // Keep replay hard-off: $snapshot bypasses before_send property
        // scrubbing, so enabling it would break the FR8 privacy boundary.
        disable_session_recording: true,
        // Surveys render PostHog-authored copy from remote config and load
        // surveys.js plus its bundled preact runtime. We do not run surveys.
        disable_surveys: true,
        // Apply queued logout/anonymous/identify before the SDK request queue
        // and remote-config fetch can run as a persisted identity.
        loaded: bindClientAndApplyPending,
        // Only build person profiles once a user is identified — keeps
        // anonymous, self-serve traffic out of person-based billing/analytics.
        on_request_error: reportPostHogRequestFailure,
        person_profiles: 'identified_only',
      });
      // Test doubles often skip `loaded`. Real posthog-js already bound above.
      if (!client) {
        bindClientAndApplyPending(posthog);
      }
    })
    .catch(() => {
      reportAnalyticsDeliveryFailure('posthog_init_failed');
    });
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
  hydratePendingAnalyticsEvents();

  runWhenIdle(loadAnalyticsSdk);
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
 * Capture a typed product-analytics event. Cloud calls made before the deferred
 * SDK bootstrap completes are persisted in a bounded session queue so redirects
 * cannot erase the funnel. Community, Desktop, and server calls remain no-ops.
 * Property shapes are enforced by {@link AnalyticsEventProperties}; the same
 * recursive privacy scrub used by `before_send` is also applied before storage.
 */
export function captureAnalyticsEvent<E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEventProperties[E],
): void {
  if (typeof window === 'undefined' || !isAnalyticsEnabled()) {
    return;
  }

  hydratePendingAnalyticsEvents();
  const pending = createPendingAnalyticsEvent(event, properties);
  if (
    pending.onceKey &&
    (pendingOnceKeys.has(pending.onceKey) || hasCapturedOnce(pending.onceKey))
  ) {
    return;
  }

  if (!client) {
    enqueuePendingAnalyticsEvent(pending);
    maybeCaptureBrandOsFirstGeneration(event);
    return;
  }

  if (!deliverAnalyticsEvent(pending)) {
    pending.attempts += 1;
    enqueuePendingAnalyticsEvent(pending);
    schedulePendingEventRetry();
  }
  maybeCaptureBrandOsFirstGeneration(event);
}

function maybeCaptureBrandOsFirstGeneration(event: AnalyticsEvent): void {
  if (
    event !== ANALYTICS_EVENTS.GENERATION_STARTED ||
    !hasAcceptedBrandOsDraft() ||
    !claimBrandOsFunnelStage('first_generation')
  ) {
    return;
  }
  captureAnalyticsEvent(ANALYTICS_EVENTS.BRAND_OS_FIRST_GENERATION, {
    source: 'public_preview',
  });
}

export function captureBrandOsFunnelStage(stage: BrandOsFunnelStage): void {
  if (!claimBrandOsFunnelStage(stage)) {
    return;
  }
  if (stage === 'draft_accepted') {
    markBrandOsDraftAccepted();
  }
  const event =
    stage === 'draft_saved'
      ? ANALYTICS_EVENTS.BRAND_OS_DRAFT_SAVED
      : stage === 'draft_accepted'
        ? ANALYTICS_EVENTS.BRAND_OS_DRAFT_ACCEPTED
        : ANALYTICS_EVENTS.BRAND_OS_FIRST_GENERATION;
  captureAnalyticsEvent(event, { source: 'public_preview' });
}

/** Capture the current route after identity and tenant scope are synchronized. */
export function captureAnalyticsPageview(pageviewKey?: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  pendingPageview = {
    key: pageviewKey ?? window.location.href,
    url: window.location.href,
  };
  applyPendingPageview();
}

/**
 * Associate subsequent events with an organization group. Called from the
 * authenticated shell once an org id is known. No PII — the id is an opaque
 * identifier the client already holds.
 */
export function identifyAnalyticsOrganization(organizationId: string): void {
  if (!organizationId) {
    return;
  }

  pendingOrganizationId = organizationId;
  applyPendingOrganization();
}

/** Clear persisted account scope without rotating an existing anonymous id. */
export function ensureAnalyticsAnonymous(): void {
  pendingIdentity = null;
  pendingOrganizationId = undefined;
  pendingPageview = null;
  clearPendingAnalyticsEvents();
  shouldEnsureAnonymous = true;
  applyPendingAnonymousState();
}

/** Clear organization attribution while preserving the authenticated person. */
export function clearAnalyticsOrganization(): void {
  pendingOrganizationId = null;
  applyPendingOrganization();
}

/** Clear the current user/group association (e.g. on sign-out). */
export function resetAnalytics(): void {
  pendingIdentity = null;
  pendingOrganizationId = undefined;
  lastCapturedPageviewKey = null;
  pendingPageview = null;
  clearPendingAnalyticsEvents();
  shouldEnsureAnonymous = false;
  shouldResetAnalytics = true;
  applyPendingReset();
}

/** Test-only hook to reset module singleton state between cases. */
export function __resetAnalyticsForTests(): void {
  unsubscribeFromFeatureFlags?.();
  clearPendingAnalyticsEvents();
  client = null;
  hasInitStarted = false;
  hasHydratedPendingEvents = false;
  lastCapturedPageviewKey = null;
  pendingIdentity = null;
  pendingOrganizationId = undefined;
  pendingPageview = null;
  shouldEnsureAnonymous = false;
  shouldResetAnalytics = false;
  unsubscribeFromFeatureFlags = null;
  capturedOnceKeys.clear();
  featureFlagSubscriptions.clear();
}

/**
 * PostHog product-analytics event taxonomy for the marketing website.
 *
 * This is the single source of truth for every event genfeed.ai (the public
 * site) emits. Pageviews are captured automatically by the PostHog client on
 * history changes; the events below are CTA-derived conversions only.
 *
 * Privacy contract: property values are restricted to code-authored tracking
 * slugs (`trackingName`, `action`) — never visitor input or free text.
 */
export const WEBSITE_ANALYTICS_EVENTS = {
  BOOK_CALL: 'book_call',
  CTA_CLICK: 'cta_click',
  START_SIGNUP: 'start_signup',
  VIEW_PRICING: 'view_pricing',
} as const;

export type WebsiteAnalyticsEvent =
  (typeof WEBSITE_ANALYTICS_EVENTS)[keyof typeof WEBSITE_ANALYTICS_EVENTS];

/** Bounded, code-authored properties attached to a tracked CTA click. */
export type WebsiteCtaPayload = Record<
  string,
  boolean | number | string | undefined
>;

const BOOK_CALL_ACTIONS = new Set([
  'book_call',
  'book_demo',
  'calendly',
  'demo',
  'schedule_call',
]);

const SIGNUP_ACTIONS = new Set([
  'core_cta',
  'get_started',
  'sign_up',
  'signup',
  'start_free',
  'start_signup',
]);

const PRICING_ACTIONS = new Set([
  'pricing',
  'pricing_cta',
  'view_plans',
  'view_pricing',
]);

function matchesActionPrefix(action: string, candidates: Set<string>): boolean {
  for (const candidate of candidates) {
    if (
      action === candidate ||
      action.startsWith(`${candidate}_`) ||
      action.startsWith(`${candidate}-`)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Map a tracked CTA click to the analytics events it represents: always
 * `cta_click`, plus the conversion intent (book a call, start signup, view
 * pricing) derived from the CTA's `action` slug.
 */
export function deriveWebsiteEventsFromCta(
  payload: WebsiteCtaPayload | undefined,
): WebsiteAnalyticsEvent[] {
  const action =
    typeof payload?.action === 'string' ? payload.action.toLowerCase() : '';

  if (matchesActionPrefix(action, BOOK_CALL_ACTIONS)) {
    return [
      WEBSITE_ANALYTICS_EVENTS.CTA_CLICK,
      WEBSITE_ANALYTICS_EVENTS.BOOK_CALL,
    ];
  }

  if (matchesActionPrefix(action, SIGNUP_ACTIONS)) {
    return [
      WEBSITE_ANALYTICS_EVENTS.CTA_CLICK,
      WEBSITE_ANALYTICS_EVENTS.START_SIGNUP,
    ];
  }

  if (matchesActionPrefix(action, PRICING_ACTIONS)) {
    return [
      WEBSITE_ANALYTICS_EVENTS.CTA_CLICK,
      WEBSITE_ANALYTICS_EVENTS.VIEW_PRICING,
    ];
  }

  return [WEBSITE_ANALYTICS_EVENTS.CTA_CLICK];
}

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
  BRAND_OS_AUTH_HANDOFF: 'brand_os_auth_handoff',
  BRAND_OS_CTA_VIEWED: 'brand_os_cta_viewed',
  BRAND_OS_INTAKE_STARTED: 'brand_os_intake_started',
  BRAND_OS_PREVIEW_COMPLETED: 'brand_os_preview_completed',
  BOOK_CALL: 'book_call',
  CTA_CLICK: 'cta_click',
  START_SIGNUP: 'start_signup',
  YOUTUBE_CLIP_ANALYSIS_COMPLETED: 'youtube_clip_analysis_completed',
  YOUTUBE_CLIP_AUTH_HANDOFF: 'youtube_clip_auth_handoff',
  YOUTUBE_CLIP_PREVIEW_COMPLETED: 'youtube_clip_preview_completed',
  YOUTUBE_CLIP_PREVIEW_REQUESTED: 'youtube_clip_preview_requested',
  YOUTUBE_CLIP_TOOL_SUBMITTED: 'youtube_clip_tool_submitted',
  YOUTUBE_CLIP_TOOL_VIEWED: 'youtube_clip_tool_viewed',
  VIEW_PRICING: 'view_pricing',
} as const;

export type WebsiteAnalyticsEvent =
  (typeof WEBSITE_ANALYTICS_EVENTS)[keyof typeof WEBSITE_ANALYTICS_EVENTS];

export type WebsiteCtaAnalyticsEvent =
  | typeof WEBSITE_ANALYTICS_EVENTS.BOOK_CALL
  | typeof WEBSITE_ANALYTICS_EVENTS.CTA_CLICK
  | typeof WEBSITE_ANALYTICS_EVENTS.START_SIGNUP
  | typeof WEBSITE_ANALYTICS_EVENTS.VIEW_PRICING;

/** Bounded, code-authored properties attached to a tracked CTA click. */
export type WebsiteCtaPayload = Record<
  string,
  boolean | number | string | undefined
>;

export interface WebsiteAnalyticsEventProperties {
  [WEBSITE_ANALYTICS_EVENTS.BRAND_OS_AUTH_HANDOFF]: {
    readonly authMode: 'sign_in' | 'sign_up';
  };
  [WEBSITE_ANALYTICS_EVENTS.BRAND_OS_CTA_VIEWED]: {
    readonly surface: 'brand_os';
  };
  [WEBSITE_ANALYTICS_EVENTS.BRAND_OS_INTAKE_STARTED]: {
    readonly intakeKind: 'manual' | 'url';
  };
  [WEBSITE_ANALYTICS_EVENTS.BRAND_OS_PREVIEW_COMPLETED]: {
    readonly outcome: 'blocked' | 'error' | 'partial' | 'ready';
  };
  [WEBSITE_ANALYTICS_EVENTS.BOOK_CALL]: WebsiteCtaPayload;
  [WEBSITE_ANALYTICS_EVENTS.CTA_CLICK]: WebsiteCtaPayload;
  [WEBSITE_ANALYTICS_EVENTS.START_SIGNUP]: WebsiteCtaPayload;
  [WEBSITE_ANALYTICS_EVENTS.VIEW_PRICING]: WebsiteCtaPayload;
  [WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_ANALYSIS_COMPLETED]: {
    readonly outcome: 'failed' | 'ready';
  };
  [WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_AUTH_HANDOFF]: {
    readonly authMode: 'sign_in' | 'sign_up';
  };
  [WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_PREVIEW_COMPLETED]: {
    readonly outcome: 'failed' | 'ready';
  };
  [WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_PREVIEW_REQUESTED]: {
    readonly recommendationRank: 1 | 2 | 3;
  };
  [WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_TOOL_SUBMITTED]: {
    readonly surface: 'youtube_clips';
  };
  [WEBSITE_ANALYTICS_EVENTS.YOUTUBE_CLIP_TOOL_VIEWED]: {
    readonly surface: 'youtube_clips';
  };
}

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
): WebsiteCtaAnalyticsEvent[] {
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

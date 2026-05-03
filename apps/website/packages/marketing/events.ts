export const WEBSITE_MARKETING_EVENTS = {
  BOOK_CALL: 'book_call',
  CTA_CLICK: 'cta_click',
  LEAD_SUBMIT: 'lead_submit',
  PAGE_VIEW: 'page_view',
  SIGNUP_COMPLETE: 'signup_complete',
  START_SIGNUP: 'start_signup',
  VIEW_PRICING: 'view_pricing',
} as const;

export type WebsiteMarketingEventName =
  (typeof WEBSITE_MARKETING_EVENTS)[keyof typeof WEBSITE_MARKETING_EVENTS];

export type MarketingEventPayload = Record<
  string,
  boolean | number | string | null | undefined
>;

export interface WebsiteMarketingEvent {
  eventId?: string;
  name: WebsiteMarketingEventName;
  payload?: MarketingEventPayload;
  url?: string;
}

export const BROWSER_AND_SERVER_MARKETING_EVENTS =
  new Set<WebsiteMarketingEventName>([
    WEBSITE_MARKETING_EVENTS.BOOK_CALL,
    WEBSITE_MARKETING_EVENTS.LEAD_SUBMIT,
    WEBSITE_MARKETING_EVENTS.SIGNUP_COMPLETE,
  ]);

export const META_EVENT_NAMES: Record<WebsiteMarketingEventName, string> = {
  [WEBSITE_MARKETING_EVENTS.BOOK_CALL]: 'Schedule',
  [WEBSITE_MARKETING_EVENTS.CTA_CLICK]: 'Contact',
  [WEBSITE_MARKETING_EVENTS.LEAD_SUBMIT]: 'Lead',
  [WEBSITE_MARKETING_EVENTS.PAGE_VIEW]: 'PageView',
  [WEBSITE_MARKETING_EVENTS.SIGNUP_COMPLETE]: 'CompleteRegistration',
  [WEBSITE_MARKETING_EVENTS.START_SIGNUP]: 'InitiateCheckout',
  [WEBSITE_MARKETING_EVENTS.VIEW_PRICING]: 'ViewContent',
};

export const LINKEDIN_EVENT_NAMES: Record<WebsiteMarketingEventName, string> = {
  [WEBSITE_MARKETING_EVENTS.BOOK_CALL]: 'book_call',
  [WEBSITE_MARKETING_EVENTS.CTA_CLICK]: 'cta_click',
  [WEBSITE_MARKETING_EVENTS.LEAD_SUBMIT]: 'lead_submit',
  [WEBSITE_MARKETING_EVENTS.PAGE_VIEW]: 'page_view',
  [WEBSITE_MARKETING_EVENTS.SIGNUP_COMPLETE]: 'signup_complete',
  [WEBSITE_MARKETING_EVENTS.START_SIGNUP]: 'start_signup',
  [WEBSITE_MARKETING_EVENTS.VIEW_PRICING]: 'view_pricing',
};

export const X_EVENT_NAMES: Record<WebsiteMarketingEventName, string> = {
  [WEBSITE_MARKETING_EVENTS.BOOK_CALL]: 'BookCall',
  [WEBSITE_MARKETING_EVENTS.CTA_CLICK]: 'ClickButton',
  [WEBSITE_MARKETING_EVENTS.LEAD_SUBMIT]: 'Lead',
  [WEBSITE_MARKETING_EVENTS.PAGE_VIEW]: 'PageView',
  [WEBSITE_MARKETING_EVENTS.SIGNUP_COMPLETE]: 'SignUp',
  [WEBSITE_MARKETING_EVENTS.START_SIGNUP]: 'StartTrial',
  [WEBSITE_MARKETING_EVENTS.VIEW_PRICING]: 'ViewContent',
};

export function createMarketingEventId(
  name: WebsiteMarketingEventName,
): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `${name}:${Date.now()}:${random}`;
}

export function isWebsiteMarketingEventName(
  value: unknown,
): value is WebsiteMarketingEventName {
  return Object.values(WEBSITE_MARKETING_EVENTS).includes(
    value as WebsiteMarketingEventName,
  );
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
  'start_signup',
]);

const PRICING_ACTIONS = new Set([
  'pricing',
  'pricing_cta',
  'view_plans',
  'view_pricing',
]);

export function deriveMarketingEventsFromCta(
  payload: MarketingEventPayload | undefined,
): WebsiteMarketingEventName[] {
  const action =
    typeof payload?.action === 'string' ? payload.action.toLowerCase() : '';

  if (BOOK_CALL_ACTIONS.has(action)) {
    return [
      WEBSITE_MARKETING_EVENTS.CTA_CLICK,
      WEBSITE_MARKETING_EVENTS.BOOK_CALL,
    ];
  }

  if (SIGNUP_ACTIONS.has(action)) {
    return [
      WEBSITE_MARKETING_EVENTS.CTA_CLICK,
      WEBSITE_MARKETING_EVENTS.START_SIGNUP,
    ];
  }

  if (PRICING_ACTIONS.has(action)) {
    return [
      WEBSITE_MARKETING_EVENTS.CTA_CLICK,
      WEBSITE_MARKETING_EVENTS.VIEW_PRICING,
    ];
  }

  return [WEBSITE_MARKETING_EVENTS.CTA_CLICK];
}

import { describe, expect, it } from 'vitest';
import {
  deriveWebsiteEventsFromCta,
  WEBSITE_ANALYTICS_EVENTS,
} from './analytics-events';

describe('deriveWebsiteEventsFromCta', () => {
  it('declares a distinct sanitized Brand OS funnel taxonomy', () => {
    expect([
      WEBSITE_ANALYTICS_EVENTS.BRAND_OS_CTA_VIEWED,
      WEBSITE_ANALYTICS_EVENTS.BRAND_OS_INTAKE_STARTED,
      WEBSITE_ANALYTICS_EVENTS.BRAND_OS_PREVIEW_COMPLETED,
      WEBSITE_ANALYTICS_EVENTS.BRAND_OS_AUTH_HANDOFF,
    ]).toEqual([
      'brand_os_cta_viewed',
      'brand_os_intake_started',
      'brand_os_preview_completed',
      'brand_os_auth_handoff',
    ]);
  });
  it('maps book-a-call actions to cta_click + book_call', () => {
    expect(
      deriveWebsiteEventsFromCta({ action: 'book_demo_bottom_cta' }),
    ).toEqual([
      WEBSITE_ANALYTICS_EVENTS.CTA_CLICK,
      WEBSITE_ANALYTICS_EVENTS.BOOK_CALL,
    ]);
  });

  it('maps signup actions to cta_click + start_signup', () => {
    expect(deriveWebsiteEventsFromCta({ action: 'start_free_hero' })).toEqual([
      WEBSITE_ANALYTICS_EVENTS.CTA_CLICK,
      WEBSITE_ANALYTICS_EVENTS.START_SIGNUP,
    ]);
    expect(deriveWebsiteEventsFromCta({ action: 'signup_formats' })).toEqual([
      WEBSITE_ANALYTICS_EVENTS.CTA_CLICK,
      WEBSITE_ANALYTICS_EVENTS.START_SIGNUP,
    ]);
  });

  it('maps pricing actions to cta_click + view_pricing', () => {
    expect(deriveWebsiteEventsFromCta({ action: 'pricing_cta' })).toEqual([
      WEBSITE_ANALYTICS_EVENTS.CTA_CLICK,
      WEBSITE_ANALYTICS_EVENTS.VIEW_PRICING,
    ]);
  });

  it('matches action prefixes case-insensitively', () => {
    expect(deriveWebsiteEventsFromCta({ action: 'Book_Demo-Header' })).toEqual([
      WEBSITE_ANALYTICS_EVENTS.CTA_CLICK,
      WEBSITE_ANALYTICS_EVENTS.BOOK_CALL,
    ]);
  });

  it('falls back to cta_click alone for unknown or missing actions', () => {
    expect(deriveWebsiteEventsFromCta({ action: 'faq_view_all' })).toEqual([
      WEBSITE_ANALYTICS_EVENTS.CTA_CLICK,
    ]);
    expect(deriveWebsiteEventsFromCta(undefined)).toEqual([
      WEBSITE_ANALYTICS_EVENTS.CTA_CLICK,
    ]);
    expect(deriveWebsiteEventsFromCta({})).toEqual([
      WEBSITE_ANALYTICS_EVENTS.CTA_CLICK,
    ]);
  });
});

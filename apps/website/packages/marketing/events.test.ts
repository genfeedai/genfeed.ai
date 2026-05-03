import { describe, expect, it } from 'vitest';
import {
  deriveMarketingEventsFromCta,
  isWebsiteMarketingEventName,
  WEBSITE_MARKETING_EVENTS,
} from './events';

describe('website marketing events', () => {
  it('recognizes canonical event names', () => {
    expect(isWebsiteMarketingEventName('page_view')).toBe(true);
    expect(isWebsiteMarketingEventName('legacy_click')).toBe(false);
  });

  it('maps booking CTAs to lower-funnel events', () => {
    expect(deriveMarketingEventsFromCta({ action: 'book_demo' })).toEqual([
      WEBSITE_MARKETING_EVENTS.CTA_CLICK,
      WEBSITE_MARKETING_EVENTS.BOOK_CALL,
    ]);
  });

  it('maps pricing CTAs to pricing views', () => {
    expect(deriveMarketingEventsFromCta({ action: 'view_plans' })).toEqual([
      WEBSITE_MARKETING_EVENTS.CTA_CLICK,
      WEBSITE_MARKETING_EVENTS.VIEW_PRICING,
    ]);
  });
});

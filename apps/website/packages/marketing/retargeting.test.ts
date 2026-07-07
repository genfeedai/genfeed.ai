import { describe, expect, it } from 'vitest';
import { WEBSITE_MARKETING_EVENTS } from './events';
import { getRetargetingRoutes } from './retargeting';

describe('marketing retargeting routes', () => {
  it('maps canonical events to configured provider routes', () => {
    expect(
      getRetargetingRoutes(WEBSITE_MARKETING_EVENTS.BOOK_CALL, [
        {
          pixelId: '1234567890',
          provider: 'meta',
        },
        {
          conversionIds: {
            book_call: '987654',
          },
          partnerId: '456789',
          provider: 'linkedin',
        },
        {
          eventIds: {
            book_call: 'tw-book-call',
          },
          pixelId: 'tw-pixel',
          provider: 'x',
        },
      ]),
    ).toEqual([
      {
        accountId: '1234567890',
        eventName: 'Schedule',
        provider: 'meta',
      },
      {
        accountId: '456789',
        conversionId: '987654',
        eventName: 'book_call',
        provider: 'linkedin',
      },
      {
        accountId: 'tw-pixel',
        conversionId: 'tw-book-call',
        eventName: 'BookCall',
        provider: 'x',
      },
    ]);
  });

  it('skips providers without configured browser IDs', () => {
    expect(
      getRetargetingRoutes(WEBSITE_MARKETING_EVENTS.VIEW_PRICING, [
        {
          pixelId: '',
          provider: 'meta',
        },
        {
          partnerId: '',
          provider: 'linkedin',
        },
        {
          pixelId: '',
          provider: 'x',
        },
      ]),
    ).toEqual([]);
  });
});

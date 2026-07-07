import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMarketingTags, trackWebsiteMarketingEvent } from './browser';
import { createConsentState } from './consent';
import { WEBSITE_MARKETING_EVENTS } from './events';

describe('website marketing browser layer', () => {
  beforeEach(() => {
    document.head
      .querySelectorAll('script[id^="genfeed-"]')
      .forEach((element) => {
        element.remove();
      });
    delete window.dataLayer;
    delete window.gtag;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fails closed without granted marketing consent', () => {
    const sendBeacon = vi.fn();
    const fetchMock = vi.fn();

    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });
    vi.stubGlobal('fetch', fetchMock);

    loadMarketingTags({ gtmContainerId: 'GTM-TEST' }, null);

    const eventId = trackWebsiteMarketingEvent(
      {
        name: WEBSITE_MARKETING_EVENTS.BOOK_CALL,
        payload: { action: 'book_demo' },
        url: 'https://genfeed.ai',
      },
      {
        config: { gtmContainerId: 'GTM-TEST' },
        consent: createConsentState('denied'),
      },
    );

    expect(eventId).toBeNull();
    expect(window.dataLayer).toBeUndefined();
    expect(document.getElementById('genfeed-gtm')).toBeNull();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pushes consented events to dataLayer without browser pixel snippets', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    const consent = createConsentState('granted');

    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    loadMarketingTags({ gtmContainerId: 'GTM-TEST' }, consent);

    const eventId = trackWebsiteMarketingEvent(
      {
        name: WEBSITE_MARKETING_EVENTS.BOOK_CALL,
        payload: { action: 'book_demo' },
        url: 'https://genfeed.ai/demo',
      },
      {
        config: { gtmContainerId: 'GTM-TEST' },
        consent,
      },
    );

    expect(eventId).toMatch(/^book_call:/);
    expect(document.getElementById('genfeed-gtm')).toHaveAttribute(
      'src',
      'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
    );
    expect(window.dataLayer).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'gtm.js',
        }),
        expect.objectContaining({
          action: 'book_demo',
          event: 'genfeed_marketing_event',
          event_id: eventId,
          event_name: WEBSITE_MARKETING_EVENTS.BOOK_CALL,
          event_source_url: 'https://genfeed.ai/demo',
          marketing_consent_ad_storage: 'granted',
        }),
      ]),
    );
    expect(sendBeacon).toHaveBeenCalledWith(
      '/api/marketing/conversions',
      expect.any(Blob),
    );
    expect(document.getElementById('genfeed-meta-pixel')).toBeNull();
    expect(document.getElementById('genfeed-linkedin-insight')).toBeNull();
    expect(document.getElementById('genfeed-x-pixel')).toBeNull();
  });
});

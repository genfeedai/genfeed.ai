import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseServerConversionRequest,
  sendServerConversions,
} from './server-conversions';

describe('server conversions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('accepts only supported lower-funnel events', () => {
    expect(
      parseServerConversionRequest({
        eventId: 'evt-1',
        name: 'book_call',
        payload: { source: 'hero' },
      }),
    ).toMatchObject({
      eventId: 'evt-1',
      name: 'book_call',
    });

    expect(
      parseServerConversionRequest({ eventId: 'evt-2', name: 'page_view' }),
    ).toBeNull();
  });

  it('sends configured Meta, LinkedIn, and X conversions with the shared event id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await sendServerConversions(
      {
        eventId: 'book_call:1',
        name: 'book_call',
        payload: {
          email: 'Founder@Example.com',
          liFatId: 'li-fat-id',
        },
        url: 'https://genfeed.ai',
      },
      {
        clientIp: '203.0.113.10',
        userAgent: 'vitest',
      },
      {
        linkedinAccessToken: 'linkedin-token',
        linkedinApiEndpoint: 'https://api.linkedin.com/rest/conversionEvents',
        linkedinApiVersion: '202606',
        linkedinConversionUrns: {
          book_call: 'urn:lla:llaPartnerConversion:123',
        },
        metaAccessToken: 'meta-token',
        metaGraphVersion: 'v99.0',
        metaPixelId: 'meta-pixel',
        xApiEndpoint: 'https://ads-api.x.com/12/measurement/conversions/tag',
        xBearerToken: 'x-token',
        xEventIds: {
          book_call: 'tw-book-call',
        },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      'https://graph.facebook.com/v99.0/meta-pixel/events',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('book_call:1');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.linkedin.com/rest/conversionEvents',
    );
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer linkedin-token',
      'Linkedin-Version': '202606',
      'X-Restli-Protocol-Version': '2.0.0',
    });
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('book_call:1');
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain(
      'urn:lla:llaPartnerConversion:123',
    );
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('SHA256_EMAIL');
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain(
      'LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID',
    );
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain(
      'PLAINTEXT_IP_ADDRESS',
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://ads-api.x.com/12/measurement/conversions/tag',
    );
    expect(fetchMock.mock.calls[2]?.[1]?.body).toContain('book_call:1');
    expect(fetchMock.mock.calls[2]?.[1]?.body).toContain('tw-book-call');
  });

  it('skips LinkedIn conversions without configured match identifiers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendServerConversions(
      {
        eventId: 'signup_complete:1',
        name: 'signup_complete',
        payload: {},
        url: 'https://genfeed.ai',
      },
      {},
      {
        linkedinAccessToken: 'linkedin-token',
        linkedinConversionUrns: {
          signup_complete: 'urn:lla:llaPartnerConversion:456',
        },
      },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      linkedin: 'skipped',
      meta: 'skipped',
      x: 'skipped',
    });
  });

  it('reports configured providers as failed when the conversion request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    const result = await sendServerConversions(
      {
        eventId: 'lead_submit:1',
        name: 'lead_submit',
        payload: {},
        url: 'https://genfeed.ai',
      },
      {},
      {
        metaAccessToken: 'meta-token',
        metaPixelId: 'meta-pixel',
      },
    );

    expect(result).toEqual({
      linkedin: 'skipped',
      meta: 'failed',
      x: 'skipped',
    });
  });
});

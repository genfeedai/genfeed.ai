import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseServerConversionRequest,
  sendServerConversions,
} from './server-conversions';

describe('server conversions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  it('sends configured Meta and X conversions with the shared event id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await sendServerConversions(
      {
        eventId: 'book_call:1',
        name: 'book_call',
        payload: { email: 'Founder@Example.com' },
        url: 'https://genfeed.ai',
      },
      {
        clientIp: '203.0.113.10',
        userAgent: 'vitest',
      },
      {
        metaAccessToken: 'meta-token',
        metaGraphVersion: 'v99.0',
        metaPixelId: 'meta-pixel',
        xApiEndpoint: 'https://ads-api.x.com/12/measurement/conversions/tag',
        xBearerToken: 'x-token',
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      'https://graph.facebook.com/v99.0/meta-pixel/events',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('book_call:1');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://ads-api.x.com/12/measurement/conversions/tag',
    );
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('book_call:1');
  });
});

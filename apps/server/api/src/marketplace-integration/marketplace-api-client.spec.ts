import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: (input: string | URL, init?: RequestInit) =>
    globalThis.fetch(input, init),
}));

/**
 * Bodies recorded from the marketplace API's own journey spec
 * (apps/api/src/ops/marketplace.integration.spec.ts in
 * genfeedai/marketplace.genfeed.ai) running against a real PostgreSQL
 * database. If the marketplace changes a response shape, re-record these.
 */
function recorded(name: string): unknown {
  return JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(
          `../../test/fixtures/marketplace/${name}.json`,
          import.meta.url,
        ),
      ),
      'utf8',
    ),
  );
}

function okResponse(body: unknown): Response {
  return {
    json: async () => body,
    ok: true,
    status: 200,
  } as unknown as Response;
}

function errorResponse(status: number): Response {
  return {
    json: async () => ({}),
    ok: false,
    status,
  } as unknown as Response;
}

describe('MarketplaceApiClient', () => {
  let client: MarketplaceApiClient;
  let configService: { get: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    configService = { get: vi.fn().mockReturnValue(undefined) };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    client = new MarketplaceApiClient(
      configService as unknown as ConfigService,
      logger as unknown as LoggerService,
    );
  });

  function lastFetchUrl(): string {
    return String(fetchMock.mock.calls.at(-1)?.[0]);
  }

  function lastFetchInit(): RequestInit {
    return (fetchMock.mock.calls.at(-1)?.[1] ?? {}) as RequestInit;
  }

  describe('base URL', () => {
    it('falls back to the localhost base URL when config is unset', async () => {
      fetchMock.mockResolvedValue(okResponse({ data: [] }));
      await client.searchListings({});
      expect(lastFetchUrl()).toContain('http://localhost:3200/marketplace/');
    });

    it('uses the configured MARKETPLACE_API_URL when present', async () => {
      configService.get.mockReturnValue('https://market.example.com');
      const configured = new MarketplaceApiClient(
        configService as unknown as ConfigService,
        logger as unknown as LoggerService,
      );
      fetchMock.mockResolvedValue(okResponse({ data: null }));
      await configured.getListing('listing-1');
      expect(lastFetchUrl()).toContain('https://market.example.com/');
    });

    it('rejects a base URL that is not absolute', () => {
      configService.get.mockReturnValue('not a url');
      expect(
        () =>
          new MarketplaceApiClient(
            configService as unknown as ConfigService,
            logger as unknown as LoggerService,
          ),
      ).toThrow('MARKETPLACE_API_URL must be a valid absolute URL');
    });
  });

  describe('searchListings', () => {
    it('reads the id, attributes and pagination of a recorded marketplace page', async () => {
      fetchMock.mockResolvedValue(okResponse(recorded('listing-page')));

      const result = await client.searchListings({
        limit: 10,
        type: 'workflow',
      });

      expect(result.listings).toHaveLength(1);
      expect(result.listings[0]).toMatchObject({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        price: 0,
        title: 'Test Workflow',
        type: 'workflow',
      });
      expect(result).toMatchObject({ limit: 10, page: 1, pages: 1, total: 1 });
    });

    it('sends every query param', async () => {
      fetchMock.mockResolvedValue(okResponse({ data: [] }));

      await client.searchListings({
        isOfficial: false,
        limit: 5,
        page: 2,
        search: 'logo',
        sort: '-createdAt',
        type: 'workflow',
      });

      const url = lastFetchUrl();
      expect(url).toContain('/marketplace/listings?');
      for (const part of [
        'search=logo',
        'type=workflow',
        'isOfficial=false',
        'limit=5',
        'page=2',
        'sort=-createdAt',
      ]) {
        expect(url).toContain(part);
      }
    });

    it('returns an empty page for the retired { docs } shape', async () => {
      fetchMock.mockResolvedValue(okResponse({ docs: [{ _id: 'a' }] }));
      const result = await client.searchListings({ limit: 7, page: 3 });
      expect(result).toEqual({
        limit: 7,
        listings: [],
        page: 3,
        pages: 0,
        total: 0,
      });
    });

    it('skips rows that have no id or title', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          data: [
            { attributes: { title: 'No id' } },
            { attributes: {}, id: 'no-title' },
            { attributes: { title: 'Kept' }, id: 'kept' },
          ],
        }),
      );
      const result = await client.searchListings({});
      expect(result.listings.map((listing) => listing.id)).toEqual(['kept']);
    });

    it('returns an empty page and warns on a non-ok response', async () => {
      fetchMock.mockResolvedValue(errorResponse(503));
      const result = await client.searchListings({});
      expect(result.listings).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('searchListings failed: 503'),
        'MarketplaceApiClient',
      );
    });

    it('returns an empty page and warns on a thrown error', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      const result = await client.searchListings({});
      expect(result.listings).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('network down'),
        'MarketplaceApiClient',
      );
    });
  });

  describe('getListing', () => {
    it('reads a recorded single listing and never exposes the payload', async () => {
      fetchMock.mockResolvedValue(okResponse(recorded('listing')));

      const listing = await client.getListing('listing-1');

      expect(listing).toMatchObject({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        title: 'Test Workflow',
        type: 'workflow',
      });
      expect(listing).not.toHaveProperty('downloadData');
      expect(lastFetchUrl()).toBe(
        'http://localhost:3200/marketplace/listings/listing-1',
      );
    });

    it('returns null and warns on a non-ok response', async () => {
      fetchMock.mockResolvedValue(errorResponse(404));
      expect(await client.getListing('missing')).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns null for a body without a resource', async () => {
      fetchMock.mockResolvedValue(okResponse({ _id: 'old-shape', title: 'X' }));
      expect(await client.getListing('x')).toBeNull();
    });
  });

  describe('getInstallPayload', () => {
    it('reads the recorded install payload and relays only the buyer token', async () => {
      fetchMock.mockResolvedValue(okResponse(recorded('install-data')));

      const result = await client.getInstallPayload('listing-1', 'buyer-jwt');

      expect(result).toEqual({
        payload: {
          downloadData: { workflow: { nodes: [] } },
          listingId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          purchaseId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          title: 'Test Workflow',
          type: 'workflow',
        },
        status: 'ok',
      });
      expect(lastFetchUrl()).toBe(
        'http://localhost:3200/marketplace/purchases/by-listing/listing-1/install-data',
      );
      expect(lastFetchInit().method).toBe('GET');
      expect(lastFetchInit().headers).toEqual({
        Accept: 'application/json',
        Authorization: 'Bearer buyer-jwt',
      });
    });

    it.each([
      [401, 'unauthorized'],
      [403, 'not-purchased'],
      [404, 'not-found'],
      [500, 'unavailable'],
    ])('maps a %s response to %s', async (status, expected) => {
      fetchMock.mockResolvedValue(errorResponse(status));
      expect(await client.getInstallPayload('listing-1', 't')).toEqual({
        status: expected,
      });
    });

    it('treats a body without a payload as unavailable', async () => {
      fetchMock.mockResolvedValue(
        okResponse({ data: { attributes: { title: 'X' }, id: 'p' } }),
      );
      expect(await client.getInstallPayload('listing-1', 't')).toEqual({
        status: 'unavailable',
      });
    });

    it('treats a thrown error as unavailable and never logs the token', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));
      expect(await client.getInstallPayload('listing-1', 'secret-jwt')).toEqual(
        {
          status: 'unavailable',
        },
      );
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
        'secret-jwt',
      );
    });
  });

  describe('createListing', () => {
    it('posts the merged payload and returns the created listing id', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          data: { attributes: { title: 'T' }, id: 'new-1', type: 'listing' },
        }),
      );

      const listing = await client.createListing('seller-1', 'org-1', {
        title: 'T',
      });

      expect(listing).toMatchObject({ id: 'new-1', title: 'T' });
      expect(JSON.parse(String(lastFetchInit().body))).toEqual({
        organizationId: 'org-1',
        sellerId: 'seller-1',
        title: 'T',
      });
    });

    it('returns null on a non-ok response', async () => {
      fetchMock.mockResolvedValue(errorResponse(400));
      expect(await client.createListing('s', 'o', {})).toBeNull();
    });
  });

  describe('submitForReview', () => {
    it('returns true on an ok response and false otherwise', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({}));
      expect(await client.submitForReview('l', 's')).toBe(true);
      fetchMock.mockResolvedValueOnce(errorResponse(500));
      expect(await client.submitForReview('l', 's')).toBe(false);
      fetchMock.mockRejectedValueOnce(new Error('x'));
      expect(await client.submitForReview('l', 's')).toBe(false);
    });
  });

  describe('getSellerByUserId', () => {
    it('returns the seller id from the resource', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          data: {
            attributes: { displayName: 'Shop', status: 'approved' },
            id: 'seller-1',
            type: 'seller',
          },
        }),
      );
      expect(await client.getSellerByUserId('user-1')).toEqual({
        id: 'seller-1',
        status: 'approved',
        storeName: 'Shop',
      });
    });

    it('returns null on a non-ok response', async () => {
      fetchMock.mockResolvedValue(errorResponse(404));
      expect(await client.getSellerByUserId('user-1')).toBeNull();
    });
  });

  describe('GEN credit price and credit purchases', () => {
    const call = {
      buyerId: 'buyer-opaque',
      creditsPaid: 2175,
      idempotencyKey: 'call-1',
      listingId: 'listing-1',
      organizationId: 'buyer-org',
    };

    function rejectedResponse(status: number, body: unknown): Response {
      return {
        json: async () => body,
        ok: false,
        status,
      } as unknown as Response;
    }

    it('reads the GEN price the marketplace states for a listing', async () => {
      fetchMock.mockResolvedValue(okResponse(recorded('listing-priced')));

      const quote = await client.getCreditQuote('listing-1');

      expect(quote).toEqual({ creditPrice: 2175, status: 'ok' });
      expect(lastFetchUrl()).toBe(
        'http://localhost:3200/marketplace/listings/listing-1',
      );
    });

    it('reports a listing without a GEN price as not payable, a 404 as not found and a failure as unavailable', async () => {
      fetchMock.mockResolvedValueOnce(
        okResponse({
          data: {
            attributes: { creditPrice: null, title: 'Free one' },
            id: 'listing-2',
            type: 'listing',
          },
        }),
      );
      expect(await client.getCreditQuote('listing-2')).toEqual({
        status: 'not-payable',
      });

      fetchMock.mockResolvedValueOnce(errorResponse(404));
      expect(await client.getCreditQuote('missing')).toEqual({
        status: 'not-found',
      });

      fetchMock.mockResolvedValueOnce(errorResponse(502));
      expect(await client.getCreditQuote('listing-1')).toEqual({
        status: 'unavailable',
      });

      fetchMock.mockRejectedValueOnce(new Error('network'));
      expect(await client.getCreditQuote('listing-1')).toEqual({
        status: 'unavailable',
      });
    });

    it('records a credit purchase with the signed service token and returns the purchase id', async () => {
      const body = recorded('credit-purchase-recorded') as {
        data: { id: string };
      };
      fetchMock.mockResolvedValue(okResponse(body));

      const result = await client.recordCreditPurchase(call, 'service-token');

      expect(result).toEqual({ purchaseId: body.data.id, status: 'recorded' });
      expect(lastFetchUrl()).toBe(
        'http://localhost:3200/marketplace/service/purchases',
      );
      expect(lastFetchInit().method).toBe('POST');
      expect(
        (lastFetchInit().headers as Record<string, string>).Authorization,
      ).toBe('Bearer service-token');
      expect(JSON.parse(String(lastFetchInit().body))).toEqual(call);
    });

    it('reports a purchase that was refunded earlier under the same key as rejected', async () => {
      fetchMock.mockResolvedValue(
        okResponse(recorded('credit-purchase-refunded')),
      );

      expect(await client.recordCreditPurchase(call, 't')).toMatchObject({
        reason: 'The purchase was refunded',
        status: 'rejected',
      });
    });

    it('reports a refused purchase with the marketplace reason and a server error as unavailable', async () => {
      fetchMock.mockResolvedValueOnce(
        rejectedResponse(409, recorded('credit-purchase-rejected')),
      );
      expect(await client.recordCreditPurchase(call, 't')).toEqual({
        httpStatus: 409,
        reason: 'The GEN price of this listing is 2175',
        status: 'rejected',
      });

      fetchMock.mockResolvedValueOnce(errorResponse(503));
      expect(await client.recordCreditPurchase(call, 't')).toEqual({
        status: 'unavailable',
      });

      fetchMock.mockRejectedValueOnce(new Error('timeout'));
      expect(await client.recordCreditPurchase(call, 't')).toEqual({
        status: 'unavailable',
      });
    });

    it.each([
      ['no status', {}, { status: 'unavailable' }],
      ['an unknown status', { status: 'pending' }, { status: 'unavailable' }],
      [
        'a refunded status',
        { status: 'refunded' },
        {
          httpStatus: 200,
          reason: 'The purchase was refunded',
          status: 'rejected',
        },
      ],
      [
        'a completed status',
        { status: 'completed' },
        { purchaseId: 'p1', status: 'recorded' },
      ],
    ])(
      'reads a 200 record answer with %s',
      async (_name, attributes, expected) => {
        fetchMock.mockResolvedValueOnce(
          okResponse({ data: { id: 'p1', attributes } }),
        );

        expect(await client.recordCreditPurchase(call, 't')).toEqual(expected);
      },
    );

    it('refunds by call key and tells a refund from an absent purchase or an outage', async () => {
      fetchMock.mockResolvedValueOnce(
        okResponse(recorded('credit-purchase-refunded')),
      );
      expect(await client.refundCreditPurchase(call, 't')).toEqual({
        status: 'refunded',
      });
      expect(lastFetchUrl()).toBe(
        'http://localhost:3200/marketplace/service/purchases/refund',
      );
      expect(JSON.parse(String(lastFetchInit().body))).toEqual(call);

      fetchMock.mockResolvedValueOnce(errorResponse(404));
      expect(
        await client.refundCreditPurchase(
          { ...call, idempotencyKey: 'call-9' },
          't',
        ),
      ).toEqual({
        status: 'absent',
      });

      fetchMock.mockResolvedValueOnce(errorResponse(500));
      expect(await client.refundCreditPurchase(call, 't')).toEqual({
        status: 'unavailable',
      });
    });
  });
});

import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type FetchMock = ReturnType<typeof vi.fn>;

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
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = global.fetch as unknown as FetchMock;
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

  describe('constructor / base URL', () => {
    it('falls back to the localhost base URL when config is unset', async () => {
      fetchMock.mockResolvedValue(okResponse({ docs: [] }));
      await client.searchListings({});
      expect(lastFetchUrl()).toContain('http://localhost:3200/marketplace/');
    });

    it('uses the configured MARKETPLACE_API_URL when present', async () => {
      configService.get.mockReturnValue('https://market.example.com');
      const configured = new MarketplaceApiClient(
        configService as unknown as ConfigService,
        logger as unknown as LoggerService,
      );
      fetchMock.mockResolvedValue(okResponse({ docs: [] }));
      await configured.getListing('listing-1');
      expect(lastFetchUrl()).toContain('https://market.example.com/');
    });
  });

  describe('searchListings', () => {
    it('returns the parsed search result and builds every query param', async () => {
      const payload = {
        docs: [{ _id: 'a', title: 'A' }],
        limit: 5,
        page: 2,
        totalDocs: 1,
        totalPages: 1,
      };
      fetchMock.mockResolvedValue(okResponse(payload));

      const result = await client.searchListings({
        isOfficial: true,
        limit: 5,
        page: 2,
        search: 'logo',
        sort: '-createdAt',
        type: 'workflow',
      });

      expect(result).toEqual(payload);
      const url = lastFetchUrl();
      expect(url).toContain('search=logo');
      expect(url).toContain('type=workflow');
      expect(url).toContain('isOfficial=true');
      expect(url).toContain('limit=5');
      expect(url).toContain('page=2');
      expect(url).toContain('sort=-createdAt');
    });

    it('includes isOfficial=false explicitly when provided', async () => {
      fetchMock.mockResolvedValue(okResponse({ docs: [] }));
      await client.searchListings({ isOfficial: false });
      expect(lastFetchUrl()).toContain('isOfficial=false');
    });

    it('returns an empty result and warns on a non-ok response', async () => {
      fetchMock.mockResolvedValue(errorResponse(503));
      const result = await client.searchListings({ limit: 7, page: 3 });
      expect(result).toEqual({
        docs: [],
        limit: 7,
        page: 3,
        totalDocs: 0,
        totalPages: 0,
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('searchListings failed: 503'),
        'MarketplaceApiClient',
      );
    });

    it('returns an empty result with defaults and warns on a thrown error', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      const result = await client.searchListings({});
      expect(result).toEqual({
        docs: [],
        limit: 20,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('searchListings error: network down'),
        'MarketplaceApiClient',
      );
    });
  });

  describe('getListing', () => {
    it('returns the listing on success', async () => {
      const listing = { _id: 'l1', title: 'Listing' };
      fetchMock.mockResolvedValue(okResponse(listing));
      await expect(client.getListing('l1')).resolves.toEqual(listing);
      expect(lastFetchUrl()).toContain('/marketplace/listings/l1');
    });

    it('returns null and warns on a non-ok response', async () => {
      fetchMock.mockResolvedValue(errorResponse(404));
      await expect(client.getListing('l1')).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('getListing failed: 404'),
        'MarketplaceApiClient',
      );
    });

    it('returns null and warns on a thrown error', async () => {
      fetchMock.mockRejectedValue(new Error('boom'));
      await expect(client.getListing('l1')).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('getListing error: boom'),
        'MarketplaceApiClient',
      );
    });
  });

  describe('getListingDownloadData', () => {
    it('maps the listing into download data, defaulting missing fields', async () => {
      fetchMock.mockResolvedValue(okResponse({ _id: 'l1', title: 'Pack' }));
      const data = await client.getListingDownloadData('l1');
      expect(data).toEqual({ downloadData: {}, title: 'Pack', type: '' });
    });

    it('passes through download data and type when present', async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          _id: 'l1',
          downloadData: { nodes: [] },
          title: 'Pack',
          type: 'workflow',
        }),
      );
      const data = await client.getListingDownloadData('l1');
      expect(data).toEqual({
        downloadData: { nodes: [] },
        title: 'Pack',
        type: 'workflow',
      });
    });

    it('returns null when the underlying listing is missing', async () => {
      fetchMock.mockResolvedValue(errorResponse(404));
      await expect(client.getListingDownloadData('l1')).resolves.toBeNull();
    });
  });

  describe('createListing', () => {
    it('posts the merged payload and returns the created listing', async () => {
      const created = { _id: 'new', title: 'New' };
      fetchMock.mockResolvedValue(okResponse(created));
      const result = await client.createListing('seller-1', 'org-1', {
        title: 'New',
      });
      expect(result).toEqual(created);
      const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
      expect(body).toMatchObject({
        organizationId: 'org-1',
        sellerId: 'seller-1',
        title: 'New',
      });
    });

    it('returns null and warns on a non-ok response', async () => {
      fetchMock.mockResolvedValue(errorResponse(400));
      await expect(
        client.createListing('seller-1', 'org-1', {}),
      ).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('createListing failed: 400'),
        'MarketplaceApiClient',
      );
    });

    it('returns null and warns on a thrown error', async () => {
      fetchMock.mockRejectedValue(new Error('boom'));
      await expect(
        client.createListing('seller-1', 'org-1', {}),
      ).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('createListing error: boom'),
        'MarketplaceApiClient',
      );
    });
  });

  describe('submitForReview', () => {
    it('returns true on an ok response', async () => {
      fetchMock.mockResolvedValue(okResponse({}));
      await expect(client.submitForReview('l1', 'seller-1')).resolves.toBe(
        true,
      );
    });

    it('returns false on a non-ok response', async () => {
      fetchMock.mockResolvedValue(errorResponse(500));
      await expect(client.submitForReview('l1', 'seller-1')).resolves.toBe(
        false,
      );
    });

    it('returns false and warns on a thrown error', async () => {
      fetchMock.mockRejectedValue(new Error('boom'));
      await expect(client.submitForReview('l1', 'seller-1')).resolves.toBe(
        false,
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('submitForReview error: boom'),
        'MarketplaceApiClient',
      );
    });
  });

  describe('getSellerByUserId', () => {
    it('returns the seller on success', async () => {
      const seller = { _id: 's1', userId: 'u1' };
      fetchMock.mockResolvedValue(okResponse(seller));
      await expect(client.getSellerByUserId('u1')).resolves.toEqual(seller);
    });

    it('returns null on a non-ok response', async () => {
      fetchMock.mockResolvedValue(errorResponse(404));
      await expect(client.getSellerByUserId('u1')).resolves.toBeNull();
    });

    it('returns null and warns on a thrown error', async () => {
      fetchMock.mockRejectedValue(new Error('boom'));
      await expect(client.getSellerByUserId('u1')).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('getSellerByUserId error: boom'),
        'MarketplaceApiClient',
      );
    });
  });

  describe('checkListingOwnership', () => {
    it('returns the ownership payload on success', async () => {
      fetchMock.mockResolvedValue(
        okResponse({ owned: true, purchase: { _id: 'p1' } }),
      );
      await expect(
        client.checkListingOwnership('l1', 'u1', 'org-1'),
      ).resolves.toEqual({ owned: true, purchase: { _id: 'p1' } });
    });

    it('returns { owned: false } on a non-ok response', async () => {
      fetchMock.mockResolvedValue(errorResponse(500));
      await expect(
        client.checkListingOwnership('l1', 'u1', 'org-1'),
      ).resolves.toEqual({ owned: false });
    });

    it('returns { owned: false } on a thrown error', async () => {
      fetchMock.mockRejectedValue(new Error('boom'));
      await expect(
        client.checkListingOwnership('l1', 'u1', 'org-1'),
      ).resolves.toEqual({ owned: false });
    });
  });

  describe('claimFreeItem', () => {
    it('returns the purchase record on success', async () => {
      fetchMock.mockResolvedValue(okResponse({ _id: 'p1' }));
      await expect(client.claimFreeItem('l1', 'u1', 'org-1')).resolves.toEqual({
        _id: 'p1',
      });
    });

    it('returns null on a non-ok response', async () => {
      fetchMock.mockResolvedValue(errorResponse(409));
      await expect(
        client.claimFreeItem('l1', 'u1', 'org-1'),
      ).resolves.toBeNull();
    });

    it('returns null on a thrown error', async () => {
      fetchMock.mockRejectedValue(new Error('boom'));
      await expect(
        client.claimFreeItem('l1', 'u1', 'org-1'),
      ).resolves.toBeNull();
    });
  });
});

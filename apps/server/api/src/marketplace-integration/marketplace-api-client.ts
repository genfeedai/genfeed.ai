import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

interface MarketplaceListingResponse {
  _id: string;
  title: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  price?: number;
  pricingTier?: string;
  type?: string;
  downloadData?: Record<string, unknown>;
  isOfficial?: boolean;
  publishedAt?: string;
}

interface MarketplaceSearchResult {
  docs: MarketplaceListingResponse[];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
}

interface MarketplaceSellerResponse {
  _id: string;
  userId: string;
  storeName?: string;
  status?: string;
}

interface MarketplaceListingQuery {
  search?: string;
  type?: string;
  isOfficial?: boolean;
  limit?: number;
  page?: number;
  sort?: string;
}

@Injectable()
export class MarketplaceApiClient {
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.baseUrl =
      this.configService.get('MARKETPLACE_API_URL') || 'http://localhost:3200';
  }

  /**
   * Search marketplace listings via the marketplace API.
   * Gracefully returns empty result on failure.
   */
  async searchListings(
    query: MarketplaceListingQuery,
  ): Promise<MarketplaceSearchResult> {
    const emptyResult: MarketplaceSearchResult = {
      docs: [],
      limit: query.limit ?? 20,
      page: query.page ?? 1,
      totalDocs: 0,
      totalPages: 0,
    };

    try {
      const params = new URLSearchParams();
      if (query.search) params.set('search', query.search);
      if (query.type) params.set('type', query.type);
      if (query.isOfficial !== undefined)
        params.set('isOfficial', String(query.isOfficial));
      if (query.limit) params.set('limit', String(query.limit));
      if (query.page) params.set('page', String(query.page));
      if (query.sort) params.set('sort', query.sort);

      const url = `${this.baseUrl}/marketplace/listings?${params.toString()}`;
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        method: 'GET',
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        this.logger.warn(
          `MarketplaceApiClient searchListings failed: ${response.status}`,
          'MarketplaceApiClient',
        );
        return emptyResult;
      }

      return (await response.json()) as MarketplaceSearchResult;
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient searchListings error: ${(error as Error).message}`,
        'MarketplaceApiClient',
      );
      return emptyResult;
    }
  }

  /**
   * Get a single listing by ID.
   * Returns null on failure.
   */
  async getListing(
    listingId: string,
  ): Promise<MarketplaceListingResponse | null> {
    try {
      const url = `${this.baseUrl}/marketplace/listings/${listingId}`;
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        method: 'GET',
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        this.logger.warn(
          `MarketplaceApiClient getListing failed: ${response.status}`,
          'MarketplaceApiClient',
        );
        return null;
      }

      return (await response.json()) as MarketplaceListingResponse;
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient getListing error: ${(error as Error).message}`,
        'MarketplaceApiClient',
      );
      return null;
    }
  }

  /**
   * Get the download data for a listing (used during install).
   * Returns null on failure.
   */
  async getListingDownloadData(listingId: string): Promise<{
    downloadData: Record<string, unknown>;
    title: string;
    type: string;
  } | null> {
    try {
      const listing = await this.getListing(listingId);
      if (!listing) return null;

      return {
        downloadData: listing.downloadData ?? {},
        title: listing.title,
        type: listing.type ?? '',
      };
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient getListingDownloadData error: ${(error as Error).message}`,
        'MarketplaceApiClient',
      );
      return null;
    }
  }

  /**
   * Create a listing on the marketplace API.
   * Returns null on failure.
   */
  async createListing(
    sellerId: string,
    organizationId: string,
    dto: Record<string, unknown>,
  ): Promise<MarketplaceListingResponse | null> {
    try {
      const url = `${this.baseUrl}/seller/listings`;
      const response = await fetch(url, {
        body: JSON.stringify({ ...dto, organizationId, sellerId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        this.logger.warn(
          `MarketplaceApiClient createListing failed: ${response.status}`,
          'MarketplaceApiClient',
        );
        return null;
      }

      return (await response.json()) as MarketplaceListingResponse;
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient createListing error: ${(error as Error).message}`,
        'MarketplaceApiClient',
      );
      return null;
    }
  }

  /**
   * Submit a listing for review (auto-approve).
   */
  async submitForReview(listingId: string, sellerId: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/seller/listings/${listingId}/submit`;
      const response = await fetch(url, {
        body: JSON.stringify({ sellerId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
      });

      return response.ok;
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient submitForReview error: ${(error as Error).message}`,
        'MarketplaceApiClient',
      );
      return false;
    }
  }

  /**
   * Get seller profile by user ID.
   * Returns null on failure.
   */
  async getSellerByUserId(
    userId: string,
  ): Promise<MarketplaceSellerResponse | null> {
    try {
      const url = `${this.baseUrl}/sellers/by-user/${userId}`;
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        method: 'GET',
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) return null;

      return (await response.json()) as MarketplaceSellerResponse;
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient getSellerByUserId error: ${(error as Error).message}`,
        'MarketplaceApiClient',
      );
      return null;
    }
  }

  /**
   * Check if a user/org owns a listing (purchase check).
   * Returns { owned: false } on failure.
   */
  async checkListingOwnership(
    listingId: string,
    userId: string,
    organizationId: string,
  ): Promise<{
    owned: boolean;
    purchase?: { _id: string };
  }> {
    try {
      const url = `${this.baseUrl}/purchases/ownership-check`;
      const response = await fetch(url, {
        body: JSON.stringify({ listingId, organizationId, userId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) return { owned: false };

      return (await response.json()) as {
        owned: boolean;
        purchase?: { _id: string };
      };
    } catch {
      return { owned: false };
    }
  }

  /**
   * Claim a free marketplace item.
   * Returns a minimal purchase record or null on failure.
   */
  async claimFreeItem(
    listingId: string,
    userId: string,
    organizationId: string,
  ): Promise<{ _id: string } | null> {
    try {
      const url = `${this.baseUrl}/purchases/claim-free`;
      const response = await fetch(url, {
        body: JSON.stringify({ listingId, organizationId, userId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) return null;

      return (await response.json()) as { _id: string };
    } catch {
      return null;
    }
  }
}

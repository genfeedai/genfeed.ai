import { isRecord, readString } from '@genfeedai/utils/data/extract.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type DestinationGuardOptions,
  safeFetch,
} from '@libs/security/destination-guard';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

interface MarketplaceListing {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  price?: number;
  pricingTier?: string;
  type?: string;
  isOfficial?: boolean;
  publishedAt?: string;
}

interface MarketplaceListingPage {
  listings: MarketplaceListing[];
  limit: number;
  page: number;
  pages: number;
  total: number;
}

interface MarketplaceSeller {
  id: string;
  storeName?: string;
  status?: string;
}

/**
 * What a buyer receives for a listing they own. The public listing endpoints
 * never carry `downloadData`; only this route does, and only for a completed
 * purchase made by the token's owner.
 */
interface MarketplaceInstallPayload {
  downloadData: Record<string, unknown>;
  listingId: string;
  purchaseId: string;
  title: string;
  type: string;
}

export type MarketplaceInstallPayloadResult =
  | { status: 'ok'; payload: MarketplaceInstallPayload }
  | { status: 'not-purchased' }
  | { status: 'not-found' }
  | { status: 'unauthorized' }
  | { status: 'unavailable' };

interface MarketplaceListingQuery {
  search?: string;
  type?: string;
  isOfficial?: boolean;
  limit?: number;
  page?: number;
  sort?: string;
}

interface JsonApiResource {
  id: string;
  attributes: Record<string, unknown>;
}

function toResource(value: unknown): JsonApiResource | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    !isRecord(value.attributes)
  ) {
    return null;
  }
  return { attributes: value.attributes, id: value.id };
}

function toListing(resource: JsonApiResource): MarketplaceListing | null {
  const { attributes } = resource;
  if (typeof attributes.title !== 'string') {
    return null;
  }
  return {
    description: readString(attributes.description),
    id: resource.id,
    isOfficial:
      typeof attributes.isOfficial === 'boolean'
        ? attributes.isOfficial
        : undefined,
    price: typeof attributes.price === 'number' ? attributes.price : undefined,
    pricingTier: readString(attributes.pricingTier),
    publishedAt: readString(attributes.publishedAt),
    shortDescription: readString(attributes.shortDescription),
    slug: readString(attributes.slug),
    title: attributes.title,
    type: readString(attributes.type),
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

@Traced()
@Injectable()
export class MarketplaceApiClient {
  private readonly baseUrl: string;
  private readonly destinationGuard: DestinationGuardOptions;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.baseUrl =
      this.configService.get('MARKETPLACE_API_URL') || 'http://localhost:3200';
    try {
      this.destinationGuard = {
        allowedOrigins: [new URL(this.baseUrl).origin],
        allowPrivateNetwork: true,
      };
    } catch {
      throw new Error('MARKETPLACE_API_URL must be a valid absolute URL');
    }
  }

  /**
   * Search published marketplace listings (public route).
   * Gracefully returns an empty page on failure.
   */
  async searchListings(
    query: MarketplaceListingQuery,
  ): Promise<MarketplaceListingPage> {
    const emptyResult: MarketplaceListingPage = {
      limit: query.limit ?? 20,
      listings: [],
      page: query.page ?? 1,
      pages: 0,
      total: 0,
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

      const response = await safeFetch(
        `${this.baseUrl}/marketplace/listings?${params.toString()}`,
        {
          headers: { Accept: 'application/json' },
          method: 'GET',
          signal: AbortSignal.timeout(5_000),
        },
        this.destinationGuard,
      );

      if (!response.ok) {
        this.logger.warn(
          `MarketplaceApiClient searchListings failed: ${response.status}`,
          'MarketplaceApiClient',
        );
        await response.body?.cancel();
        return emptyResult;
      }

      const body: unknown = await response.json();
      if (!isRecord(body) || !Array.isArray(body.data)) {
        this.logger.warn(
          'MarketplaceApiClient searchListings: unexpected response shape',
          'MarketplaceApiClient',
        );
        return emptyResult;
      }

      const listings = body.data
        .map(toResource)
        .map((resource) => (resource ? toListing(resource) : null))
        .filter((listing): listing is MarketplaceListing => listing !== null);
      const links = isRecord(body.topLevelLinks) ? body.topLevelLinks : {};
      const pagination = isRecord(links.pagination) ? links.pagination : {};

      return {
        limit: numberOr(pagination.limit, emptyResult.limit),
        listings,
        page: numberOr(pagination.page, emptyResult.page),
        pages: numberOr(pagination.pages, 0),
        total: numberOr(pagination.total, listings.length),
      };
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient searchListings error: ${(error as Error).message}`,
        'MarketplaceApiClient',
      );
      return emptyResult;
    }
  }

  /**
   * Get a single published listing by id (public route).
   * Returns null on failure.
   */
  async getListing(listingId: string): Promise<MarketplaceListing | null> {
    try {
      const response = await safeFetch(
        `${this.baseUrl}/marketplace/listings/${encodeURIComponent(listingId)}`,
        {
          headers: { Accept: 'application/json' },
          method: 'GET',
          signal: AbortSignal.timeout(5_000),
        },
        this.destinationGuard,
      );

      if (!response.ok) {
        this.logger.warn(
          `MarketplaceApiClient getListing failed: ${response.status}`,
          'MarketplaceApiClient',
        );
        await response.body?.cancel();
        return null;
      }

      const body: unknown = await response.json();
      const resource = isRecord(body) ? toResource(body.data) : null;
      return resource ? toListing(resource) : null;
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient getListing error: ${(error as Error).message}`,
        'MarketplaceApiClient',
      );
      return null;
    }
  }

  /**
   * Read the install payload of a listing the token's owner has bought.
   * The marketplace checks the signed buyer token and a completed purchase;
   * this client only relays the buyer's own bearer token.
   */
  async getInstallPayload(
    listingId: string,
    buyerToken: string,
  ): Promise<MarketplaceInstallPayloadResult> {
    try {
      const response = await safeFetch(
        `${this.baseUrl}/marketplace/purchases/by-listing/${encodeURIComponent(listingId)}/install-data`,
        {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${buyerToken}`,
          },
          method: 'GET',
          signal: AbortSignal.timeout(10_000),
        },
        this.destinationGuard,
      );

      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401) return { status: 'unauthorized' };
        if (response.status === 403) return { status: 'not-purchased' };
        if (response.status === 404) return { status: 'not-found' };
        this.logger.warn(
          `MarketplaceApiClient getInstallPayload failed: ${response.status}`,
          'MarketplaceApiClient',
        );
        return { status: 'unavailable' };
      }

      const body: unknown = await response.json();
      const resource = isRecord(body) ? toResource(body.data) : null;
      const attributes = resource?.attributes;
      if (
        !attributes ||
        typeof attributes.listingId !== 'string' ||
        typeof attributes.title !== 'string' ||
        typeof attributes.type !== 'string' ||
        !isRecord(attributes.downloadData)
      ) {
        this.logger.warn(
          'MarketplaceApiClient getInstallPayload: unexpected response shape',
          'MarketplaceApiClient',
        );
        return { status: 'unavailable' };
      }

      return {
        payload: {
          downloadData: attributes.downloadData,
          listingId: attributes.listingId,
          purchaseId: resource.id,
          title: attributes.title,
          type: attributes.type,
        },
        status: 'ok',
      };
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient getInstallPayload error: ${(error as Error).message}`,
        'MarketplaceApiClient',
      );
      return { status: 'unavailable' };
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
  ): Promise<MarketplaceListing | null> {
    try {
      const response = await safeFetch(
        `${this.baseUrl}/seller/listings`,
        {
          body: JSON.stringify({ ...dto, organizationId, sellerId }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
        },
        this.destinationGuard,
      );

      if (!response.ok) {
        this.logger.warn(
          `MarketplaceApiClient createListing failed: ${response.status}`,
          'MarketplaceApiClient',
        );
        await response.body?.cancel();
        return null;
      }

      const body: unknown = await response.json();
      const resource = isRecord(body) ? toResource(body.data) : null;
      return resource ? toListing(resource) : null;
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
      const response = await safeFetch(
        `${this.baseUrl}/seller/listings/${encodeURIComponent(listingId)}/submit`,
        {
          body: JSON.stringify({ sellerId }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: AbortSignal.timeout(5_000),
        },
        this.destinationGuard,
      );

      const succeeded = response.ok;
      await response.body?.cancel();
      return succeeded;
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
  async getSellerByUserId(userId: string): Promise<MarketplaceSeller | null> {
    try {
      const response = await safeFetch(
        `${this.baseUrl}/sellers/by-user/${encodeURIComponent(userId)}`,
        {
          headers: { Accept: 'application/json' },
          method: 'GET',
          signal: AbortSignal.timeout(5_000),
        },
        this.destinationGuard,
      );

      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }

      const body: unknown = await response.json();
      const resource = isRecord(body) ? toResource(body.data) : null;
      if (!resource) return null;
      return {
        id: resource.id,
        status: readString(resource.attributes.status),
        storeName: readString(resource.attributes.displayName),
      };
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient getSellerByUserId error: ${(error as Error).message}`,
        'MarketplaceApiClient',
      );
      return null;
    }
  }
}

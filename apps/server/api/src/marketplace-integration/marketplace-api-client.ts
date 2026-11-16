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
  /** The GEN credit price the marketplace derives from the card price; null when not payable in credits. */
  creditPrice?: number | null;
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

/** The price a buyer pays in credits, as the marketplace states it. */
export type MarketplaceCreditQuoteResult =
  | { status: 'ok'; creditPrice: number }
  | { status: 'not-payable' }
  | { status: 'not-found' }
  | { status: 'unavailable' };

export type MarketplaceCreditPurchaseResult =
  | { status: 'recorded'; purchaseId: string }
  | { status: 'rejected'; httpStatus: number; reason: string }
  | { status: 'unavailable' };

export type MarketplaceCreditRefundResult =
  | { status: 'refunded' }
  | { status: 'absent' }
  | { status: 'unavailable' };

export interface MarketplaceCreditPurchaseInput {
  buyerId: string;
  creditsPaid: number;
  idempotencyKey: string;
  listingId: string;
  organizationId: string;
}

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
    creditPrice:
      typeof attributes.creditPrice === 'number'
        ? attributes.creditPrice
        : attributes.creditPrice === null
          ? null
          : undefined,
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

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    return isRecord(body) && typeof body.message === 'string'
      ? body.message
      : `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
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
   * Read the GEN price of a listing from the marketplace (public route). The
   * price is never taken from the browser.
   */
  async getCreditQuote(
    listingId: string,
  ): Promise<MarketplaceCreditQuoteResult> {
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
        await response.body?.cancel();
        return response.status === 404
          ? { status: 'not-found' }
          : { status: 'unavailable' };
      }

      const body: unknown = await response.json();
      const resource = isRecord(body) ? toResource(body.data) : null;
      const creditPrice = resource?.attributes.creditPrice;
      if (!resource || creditPrice === undefined) {
        return { status: 'unavailable' };
      }
      if (typeof creditPrice !== 'number' || creditPrice <= 0) {
        return { status: 'not-payable' };
      }
      return { creditPrice, status: 'ok' };
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient getCreditQuote error: ${(error as Error).message}`,
        'MarketplaceApiClient',
      );
      return { status: 'unavailable' };
    }
  }

  /**
   * Record a purchase the API already took credits for. The marketplace
   * checks the signed service token, the price and the call key, and answers
   * the same purchase to a retried call.
   */
  async recordCreditPurchase(
    input: MarketplaceCreditPurchaseInput,
    serviceToken: string,
  ): Promise<MarketplaceCreditPurchaseResult> {
    try {
      const response = await safeFetch(
        `${this.baseUrl}/marketplace/service/purchases`,
        {
          body: JSON.stringify(input),
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${serviceToken}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
        },
        this.destinationGuard,
      );

      if (response.status >= 500) {
        await response.body?.cancel();
        return { status: 'unavailable' };
      }
      if (!response.ok) {
        const reason = await readErrorMessage(response);
        return { httpStatus: response.status, reason, status: 'rejected' };
      }

      const body: unknown = await response.json();
      const resource = isRecord(body) ? toResource(body.data) : null;
      if (!resource) {
        return { status: 'unavailable' };
      }
      // Only an explicit status settles the outcome. A body that omits it or
      // names another status leaves the purchase unconfirmed, so the caller
      // asks the marketplace to refund and keeps the credits until it answers.
      if (resource.attributes.status === 'completed') {
        return { purchaseId: resource.id, status: 'recorded' };
      }
      if (resource.attributes.status === 'refunded') {
        return {
          httpStatus: response.status,
          reason: 'The purchase was refunded',
          status: 'rejected',
        };
      }
      return { status: 'unavailable' };
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient recordCreditPurchase error: ${(error as Error).message}`,
        'MarketplaceApiClient',
      );
      return { status: 'unavailable' };
    }
  }

  /**
   * Refund a credit purchase by its call key. The call's buyer, listing and
   * amount ride along so that, when no purchase exists yet, the marketplace
   * writes the key as refunded and a record call still in flight cannot
   * complete it afterwards. `absent` means the marketplace holds no purchase
   * under the key and could not write that marker (the listing can no longer
   * be sold, so a late record is refused anyway).
   */
  async refundCreditPurchase(
    purchase: MarketplaceCreditPurchaseInput,
    serviceToken: string,
  ): Promise<MarketplaceCreditRefundResult> {
    try {
      const response = await safeFetch(
        `${this.baseUrl}/marketplace/service/purchases/refund`,
        {
          body: JSON.stringify(purchase),
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${serviceToken}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
        },
        this.destinationGuard,
      );

      await response.body?.cancel();
      if (response.ok) return { status: 'refunded' };
      if (response.status === 404) return { status: 'absent' };
      return { status: 'unavailable' };
    } catch (error: unknown) {
      this.logger.warn(
        `MarketplaceApiClient refundCreditPurchase error: ${(error as Error).message}`,
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

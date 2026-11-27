import { ListingStatus } from '@genfeedai/contracts';
import { adminGet, adminPost, adminRequest } from '@/api/admin-client';
import { flattenCollection, flattenSingle, type JsonApiDocument } from '@/api/json-api';
import { deriveMarketplaceApiUrl, parseMarketplaceApiUrl } from '@/config/endpoints';
import { getApiUrl } from '@/config/store';
import { ApiError, GenfeedError } from '@/utils/errors';

/** The marketplace API caps a page at 100 rows (`BaseQueryDto` in its `apps/api`). */
const LISTINGS_PAGE_SIZE = 100;
const LISTINGS_PATH = '/admin/marketplace/listings';

export const MARKETPLACE_LISTING_STATUSES: readonly ListingStatus[] = Object.values(ListingStatus);

export interface AdminMarketplaceListing {
  createdAt?: string;
  currency?: string;
  description?: string;
  downloadData?: Record<string, unknown>;
  id: string;
  packageSlug?: string | null;
  packageSource?: string | null;
  previewData?: Record<string, unknown>;
  /** Price in cents; 0 is a free listing. */
  price?: number;
  rejectionReason?: string | null;
  shortDescription?: string;
  slug?: string;
  status: ListingStatus;
  tags?: string[];
  title: string;
  type: string;
  version?: string;
}

/** The fields a sync writes to a listing; the source key is set once, on create. */
export interface MarketplaceListingFields {
  description: string;
  downloadData: Record<string, unknown>;
  previewData: Record<string, unknown>;
  price: number;
  shortDescription: string;
  tags: string[];
  title: string;
  version: string;
}

export interface MarketplaceListingCreate extends MarketplaceListingFields {
  packageSlug: string;
  packageSource: string;
  type: string;
}

export interface MarketplaceReviewDecision {
  isApproved: boolean;
  /** Moderator note on approval, rejection reason on rejection (max 500 characters). */
  reason?: string;
}

type MarketplaceCollection = JsonApiDocument & {
  topLevelLinks?: { pagination?: { pages?: unknown } };
};

export function parseMarketplaceListingStatus(value: string): ListingStatus {
  const status = MARKETPLACE_LISTING_STATUSES.find((candidate) => candidate === value);
  if (!status) {
    throw new GenfeedError(
      `Unknown listing status "${value}"`,
      `Use one of: ${MARKETPLACE_LISTING_STATUSES.join(', ')}`
    );
  }
  return status;
}

/** The marketplace API to call: the explicit URL when given, else derived from the profile. */
export async function resolveMarketplaceApiUrl(override?: string): Promise<string> {
  if (override) {
    const parsed = parseMarketplaceApiUrl(override);
    if (!parsed) {
      throw new GenfeedError(
        `Invalid marketplace URL "${override}"`,
        'Use an https URL, for example https://api.shop.genfeed.ai'
      );
    }
    return parsed;
  }

  const apiUrl = await getApiUrl();
  const derived = deriveMarketplaceApiUrl(apiUrl);
  if (!derived) {
    throw new GenfeedError(
      `Could not work out the marketplace API URL from ${apiUrl}`,
      'Pass --marketplace-url <url>'
    );
  }
  return derived;
}

function readPageCount(response: MarketplaceCollection): number {
  const pages = response.topLevelLinks?.pagination?.pages;
  return typeof pages === 'number' && Number.isFinite(pages) ? pages : 1;
}

async function readListingsPage(
  marketplaceApiUrl: string,
  status: ListingStatus,
  page: number
): Promise<MarketplaceCollection> {
  const query = new URLSearchParams({
    limit: String(LISTINGS_PAGE_SIZE),
    page: String(page),
    status,
  });
  return adminGet<MarketplaceCollection>(`${LISTINGS_PATH}?${query}`, marketplaceApiUrl);
}

/** Every listing in one status, newest first. The API pages the list, so walk the pages. */
export async function readMarketplaceListings(
  marketplaceApiUrl: string,
  status: ListingStatus
): Promise<AdminMarketplaceListing[]> {
  const first = await readListingsPage(marketplaceApiUrl, status, 1);
  const listings = flattenCollection<AdminMarketplaceListing>(first);

  for (let page = 2; page <= readPageCount(first); page += 1) {
    listings.push(
      ...flattenCollection<AdminMarketplaceListing>(
        await readListingsPage(marketplaceApiUrl, status, page)
      )
    );
  }

  return listings;
}

export async function readMarketplaceListing(
  marketplaceApiUrl: string,
  listingId: string
): Promise<AdminMarketplaceListing> {
  return flattenSingle<AdminMarketplaceListing>(
    await adminGet<JsonApiDocument>(
      `${LISTINGS_PATH}/${encodeURIComponent(listingId)}`,
      marketplaceApiUrl
    )
  );
}

/** Approve (publish) or reject a listing that is waiting for review. */
export async function reviewMarketplaceListing(
  marketplaceApiUrl: string,
  listingId: string,
  decision: MarketplaceReviewDecision
): Promise<AdminMarketplaceListing> {
  const action = decision.isApproved ? 'approve' : 'reject';
  return flattenSingle<AdminMarketplaceListing>(
    await adminPost<JsonApiDocument>(
      `${LISTINGS_PATH}/${encodeURIComponent(listingId)}/${action}`,
      decision.reason ? { reason: decision.reason } : {},
      marketplaceApiUrl
    )
  );
}

/** Every listing of any status that was synced from one source, in any order. */
export async function readMarketplaceListingsBySource(
  marketplaceApiUrl: string,
  packageSource: string
): Promise<AdminMarketplaceListing[]> {
  const readPage = (page: number): Promise<MarketplaceCollection> =>
    adminGet<MarketplaceCollection>(
      `${LISTINGS_PATH}?${new URLSearchParams({
        limit: String(LISTINGS_PAGE_SIZE),
        packageSource,
        page: String(page),
      })}`,
      marketplaceApiUrl
    );

  const first = await readPage(1);
  const listings = flattenCollection<AdminMarketplaceListing>(first);
  for (let page = 2; page <= readPageCount(first); page += 1) {
    listings.push(...flattenCollection<AdminMarketplaceListing>(await readPage(page)));
  }
  return listings;
}

/** Whether the signed-in super admin already has the seller profile listings are created under. */
export async function hasMarketplaceSellerProfile(marketplaceApiUrl: string): Promise<boolean> {
  try {
    await adminGet<JsonApiDocument>('/seller/profile', marketplaceApiUrl);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) return false;
    throw error;
  }
}

export async function createMarketplaceSellerProfile(
  marketplaceApiUrl: string,
  displayName: string
): Promise<void> {
  await adminPost<JsonApiDocument>('/seller/profile', { displayName }, marketplaceApiUrl);
}

export async function createMarketplaceListing(
  marketplaceApiUrl: string,
  listing: MarketplaceListingCreate
): Promise<AdminMarketplaceListing> {
  return flattenSingle<AdminMarketplaceListing>(
    await adminPost<JsonApiDocument>('/seller/listings', listing, marketplaceApiUrl)
  );
}

export async function updateMarketplaceListing(
  marketplaceApiUrl: string,
  listingId: string,
  fields: MarketplaceListingFields
): Promise<AdminMarketplaceListing> {
  return flattenSingle<AdminMarketplaceListing>(
    await adminRequest<JsonApiDocument>(
      'PUT',
      `/seller/listings/${encodeURIComponent(listingId)}`,
      fields,
      marketplaceApiUrl
    )
  );
}

export async function submitMarketplaceListing(
  marketplaceApiUrl: string,
  listingId: string
): Promise<AdminMarketplaceListing> {
  return flattenSingle<AdminMarketplaceListing>(
    await adminPost<JsonApiDocument>(
      `/seller/listings/${encodeURIComponent(listingId)}/submit`,
      {},
      marketplaceApiUrl
    )
  );
}

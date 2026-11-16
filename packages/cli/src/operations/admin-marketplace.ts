import { ListingStatus } from '@genfeedai/contracts';
import { adminGet, adminPost } from '@/api/admin-client';
import { flattenCollection, flattenSingle, type JsonApiDocument } from '@/api/json-api';
import { deriveMarketplaceApiUrl, parseMarketplaceApiUrl } from '@/config/endpoints';
import { getApiUrl } from '@/config/store';
import { GenfeedError } from '@/utils/errors';

/** The marketplace API caps a page at 100 rows (`BaseQueryDto` in its `apps/api`). */
const LISTINGS_PAGE_SIZE = 100;
const LISTINGS_PATH = '/admin/marketplace/listings';

export const MARKETPLACE_LISTING_STATUSES: readonly ListingStatus[] = Object.values(ListingStatus);

export interface AdminMarketplaceListing {
  createdAt?: string;
  currency?: string;
  id: string;
  /** Price in cents; 0 is a free listing. */
  price?: number;
  rejectionReason?: string | null;
  slug?: string;
  status: ListingStatus;
  title: string;
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
        'Use an https URL, for example https://api.marketplace.genfeed.ai'
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

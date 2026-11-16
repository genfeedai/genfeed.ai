import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ListingStatus } from '@genfeedai/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAdminTokenCache } from '../../src/api/admin-client';
import {
  parseMarketplaceListingStatus,
  readMarketplaceListing,
  readMarketplaceListings,
  resolveMarketplaceApiUrl,
  reviewMarketplaceListing,
} from '../../src/operations/admin-marketplace';
import { ApiError, GenfeedError } from '../../src/utils/errors';

const { mockGetApiUrl } = vi.hoisted(() => ({ mockGetApiUrl: vi.fn() }));

vi.mock('../../src/config/store', () => ({
  getAdminSession: async () => ({
    cookieName: 'better-auth.session_token',
    cookieValue: 'session-value',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  }),
  getApiUrl: () => mockGetApiUrl(),
}));

const ADMIN_TOKEN = `header.${Buffer.from(
  JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })
).toString('base64url')}.signature`;

const MEMBER_TOKEN = ADMIN_TOKEN.replace('.signature', '.member');

interface StoredListing {
  id: string;
  price: number;
  rejectionReason: string | null;
  status: ListingStatus;
  title: string;
  type: string;
}

/** A stand-in for both services: the Genfeed API mints the token, the marketplace API owns listings. */
let listings: StoredListing[] = [];
let server: Server;
let origin: string;

function resource(listing: StoredListing): unknown {
  const { id, ...attributes } = listing;
  return { attributes, id, type: 'listing' };
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<{ reason?: string }> {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  return raw ? (JSON.parse(raw) as { reason?: string }) : {};
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', origin);

  if (url.pathname === '/v1/auth/token') {
    send(response, 200, { token: ADMIN_TOKEN });
    return;
  }
  if (url.pathname === '/v1/not-admin/auth/token') {
    send(response, 200, { token: MEMBER_TOKEN });
    return;
  }
  if (request.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) {
    send(response, 403, { detail: 'Only platform superadmins can access this resource' });
    return;
  }

  const [, id, action] =
    url.pathname.match(/^\/admin\/marketplace\/listings(?:\/([^/]+))?(?:\/(approve|reject))?$/) ??
    [];
  if (!url.pathname.startsWith('/admin/marketplace/listings')) {
    send(response, 404, { message: 'Not found' });
    return;
  }

  if (!id) {
    const limit = 2;
    const page = Number(url.searchParams.get('page'));
    const matching = listings.filter(
      (listing) => listing.status === url.searchParams.get('status')
    );
    send(response, 200, {
      data: matching.slice((page - 1) * limit, page * limit).map(resource),
      topLevelLinks: {
        pagination: {
          limit,
          page,
          pages: Math.ceil(matching.length / limit),
          total: matching.length,
        },
      },
    });
    return;
  }

  const listing = listings.find((candidate) => candidate.id === id);
  if (!listing) {
    send(response, 404, { message: 'Listing not found' });
    return;
  }
  if (action) {
    if (listing.status !== ListingStatus.PENDING_REVIEW) {
      send(response, 400, { message: 'Only pending_review listings can be moderated' });
      return;
    }
    const { reason } = await readBody(request);
    listing.status = action === 'approve' ? ListingStatus.PUBLISHED : ListingStatus.REJECTED;
    listing.rejectionReason = action === 'approve' ? null : (reason ?? 'Rejected by moderator');
  }
  send(response, 200, { data: resource(listing) });
}

describe('operations/admin-marketplace', () => {
  beforeAll(async () => {
    server = createServer((request, response) => void handle(request, response));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    clearAdminTokenCache();
    mockGetApiUrl.mockResolvedValue(`${origin}/v1`);
    listings = [
      {
        id: 'l1',
        price: 1900,
        rejectionReason: null,
        status: ListingStatus.PENDING_REVIEW,
        title: 'Launch prompts',
        type: 'prompt',
      },
      {
        id: 'l2',
        price: 0,
        rejectionReason: null,
        status: ListingStatus.PENDING_REVIEW,
        title: 'Reel workflow',
        type: 'workflow',
      },
      {
        id: 'l3',
        price: 4900,
        rejectionReason: null,
        status: ListingStatus.PENDING_REVIEW,
        title: 'Brand preset',
        type: 'preset',
      },
      {
        id: 'l4',
        price: 0,
        rejectionReason: null,
        status: ListingStatus.PUBLISHED,
        title: 'Free skill',
        type: 'skill',
      },
    ];
  });

  it('reads every listing waiting for review across the pages the API returns', async () => {
    const pending = await readMarketplaceListings(origin, ListingStatus.PENDING_REVIEW);

    expect(pending.map((listing) => [listing.id, listing.title, listing.price])).toEqual([
      ['l1', 'Launch prompts', 1900],
      ['l2', 'Reel workflow', 0],
      ['l3', 'Brand preset', 4900],
    ]);
  });

  it('publishes an approved listing, which then leaves the review queue', async () => {
    const approved = await reviewMarketplaceListing(origin, 'l1', { isApproved: true });

    expect(approved).toMatchObject({ id: 'l1', status: ListingStatus.PUBLISHED });
    const pending = await readMarketplaceListings(origin, ListingStatus.PENDING_REVIEW);
    expect(pending.map((listing) => listing.id)).toEqual(['l2', 'l3']);
  });

  it('rejects a listing with the reason the seller will see', async () => {
    await reviewMarketplaceListing(origin, 'l2', { isApproved: false, reason: 'Missing preview' });

    await expect(readMarketplaceListing(origin, 'l2')).resolves.toMatchObject({
      rejectionReason: 'Missing preview',
      status: ListingStatus.REJECTED,
    });
  });

  it('reports the API refusal when the listing is not waiting for review', async () => {
    const review = reviewMarketplaceListing(origin, 'l4', { isApproved: true });

    await expect(review).rejects.toThrow(ApiError);
    await expect(review).rejects.toThrow('Only pending_review listings can be moderated');
  });

  it('explains a refusal when the signed-in account is not a super admin', async () => {
    mockGetApiUrl.mockResolvedValue(`${origin}/v1/not-admin`);

    const read = readMarketplaceListings(origin, ListingStatus.PENDING_REVIEW);

    await expect(read).rejects.toThrow('Only platform superadmins can access this resource');
    await expect(read).rejects.toMatchObject({
      statusCode: 403,
      suggestion: 'This route needs a super admin account',
    });
  });

  it.each([
    ['https://api.genfeed.ai/v1', undefined, 'https://api.marketplace.genfeed.ai'],
    ['https://api.genfeed.ai/v1', 'https://staging.example.com/', 'https://staging.example.com'],
  ])(
    'resolves the marketplace URL for profile %s and override %s',
    async (apiUrl, override, expected) => {
      mockGetApiUrl.mockResolvedValue(apiUrl);

      await expect(resolveMarketplaceApiUrl(override)).resolves.toBe(expected);
    }
  );

  it('asks for an explicit URL when none can be derived or the override is unsafe', async () => {
    mockGetApiUrl.mockResolvedValue('https://example.com/api/v1');

    await expect(resolveMarketplaceApiUrl()).rejects.toThrow(GenfeedError);
    await expect(resolveMarketplaceApiUrl('http://api.marketplace.genfeed.ai')).rejects.toThrow(
      'Invalid marketplace URL'
    );
  });

  it('accepts only the statuses the marketplace knows', () => {
    expect(parseMarketplaceListingStatus('pending_review')).toBe(ListingStatus.PENDING_REVIEW);
    expect(() => parseMarketplaceListingStatus('live')).toThrow('Unknown listing status "live"');
  });
});

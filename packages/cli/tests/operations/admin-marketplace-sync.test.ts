import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ListingStatus } from '@genfeedai/contracts';
import type { PresetCatalogEntry } from '@genfeedai/contracts/constants/preset-catalog.constant';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAdminTokenCache } from '../../src/api/admin-client';
import {
  applySyncPlan,
  buildPresetListings,
  PRESET_LISTING_SOURCE,
  readSkillListings,
  readSyncPlan,
} from '../../src/operations/admin-marketplace-sync';

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

interface StoredListing extends Record<string, unknown> {
  id: string;
  packageSlug: string;
  packageSource: string;
  status: ListingStatus;
}

const CATALOG: PresetCatalogEntry[] = [
  {
    description: 'A clean portrait with room for a circular crop.',
    key: 'studio-profile-picture',
    kind: 'studio',
    label: 'Profile picture',
    prompt: 'Create a professional profile picture of your subject.',
    type: 'image',
    values: { aspectRatio: '1:1' },
  },
  {
    description: 'A 10 second clip that shows what the product does.',
    key: 'b2b-product-demo',
    kind: 'b2b',
    label: 'Product demo',
    prompt: '',
    type: 'video',
    values: { playbook: { key: 'b2b-product-demo' } },
  },
];

let hasSeller = false;
let listings: StoredListing[] = [];
let server: Server;
let origin: string;

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function resource(listing: StoredListing): unknown {
  const { id, ...attributes } = listing;
  return { attributes, id, type: 'listing' };
}

/** A stand-in for the Genfeed API (mints the token) and the store API (owns listings). */
async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', origin);
  if (url.pathname === '/v1/auth/token') return send(response, 200, { token: ADMIN_TOKEN });

  if (url.pathname === '/seller/profile') {
    if (request.method === 'POST') {
      hasSeller = true;
      return send(response, 201, { data: { attributes: {}, id: 's1', type: 'seller' } });
    }
    return hasSeller
      ? send(response, 200, { data: { attributes: {}, id: 's1', type: 'seller' } })
      : send(response, 404, { title: 'Seller not found' });
  }

  if (url.pathname === '/admin/marketplace/listings' && request.method === 'GET') {
    const source = url.searchParams.get('packageSource');
    const matching = listings.filter((listing) => listing.packageSource === source);
    return send(response, 200, {
      data: matching.map(resource),
      topLevelLinks: { pagination: { limit: 100, page: 1, pages: 1, total: matching.length } },
    });
  }

  if (url.pathname === '/seller/listings' && request.method === 'POST') {
    const body = await readBody(request);
    const listing = {
      ...body,
      id: `l${listings.length + 1}`,
      status: ListingStatus.DRAFT,
    } as StoredListing;
    listings.push(listing);
    return send(response, 201, { data: resource(listing) });
  }

  const [, id, action] =
    url.pathname.match(
      /^\/(?:seller|admin\/marketplace)\/listings\/([^/]+)(?:\/(submit|approve))?$/
    ) ?? [];
  const listing = listings.find((candidate) => candidate.id === id);
  if (!listing) return send(response, 404, { title: 'Listing not found' });
  if (action === 'submit') listing.status = ListingStatus.PENDING_REVIEW;
  else if (action === 'approve') listing.status = ListingStatus.PUBLISHED;
  else if (request.method === 'PUT') Object.assign(listing, await readBody(request));
  return send(response, 200, { data: resource(listing) });
}

async function syncOnce(drafts = buildPresetListings(CATALOG)) {
  const plan = await readSyncPlan(origin, drafts);
  return { plan, result: await applySyncPlan(origin, plan) };
}

describe('operations/admin-marketplace-sync', () => {
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
    hasSeller = false;
    listings = [];
  });

  it('publishes every preset as a free listing and creates the seller first', async () => {
    const { result } = await syncOnce();

    expect(result).toEqual({ created: 2, failed: [], published: 2, unchanged: 0, updated: 0 });
    expect(hasSeller).toBe(true);
    expect(
      listings.map(({ packageSlug, packageSource, price, status, title, type }) => ({
        packageSlug,
        packageSource,
        price,
        status,
        title,
        type,
      }))
    ).toEqual([
      {
        packageSlug: 'studio-profile-picture',
        packageSource: PRESET_LISTING_SOURCE,
        price: 0,
        status: ListingStatus.PUBLISHED,
        title: 'Profile picture',
        type: 'preset',
      },
      {
        packageSlug: 'b2b-product-demo',
        packageSource: PRESET_LISTING_SOURCE,
        price: 0,
        status: ListingStatus.PUBLISHED,
        title: 'Product demo',
        type: 'preset',
      },
    ]);
  });

  it('creates nothing on a second run', async () => {
    await syncOnce();
    const { plan, result } = await syncOnce();

    expect(plan.entries.map((entry) => entry.action)).toEqual(['unchanged', 'unchanged']);
    expect(result).toMatchObject({ created: 0, published: 0, unchanged: 2, updated: 0 });
    expect(listings).toHaveLength(2);
  });

  it('updates a listing whose source changed and keeps it published', async () => {
    await syncOnce();
    const changed = structuredClone(CATALOG);
    changed[0].description = 'A sharper portrait with room for a circular crop.';

    const { result } = await syncOnce(buildPresetListings(changed));

    expect(result).toMatchObject({ created: 0, published: 0, unchanged: 1, updated: 1 });
    expect(listings[0]).toMatchObject({
      shortDescription: 'A sharper portrait with room for a circular crop.',
      status: ListingStatus.PUBLISHED,
    });
  });

  it('finishes a listing an earlier run left as a draft', async () => {
    await syncOnce();
    listings[1].status = ListingStatus.DRAFT;

    const { plan, result } = await syncOnce();

    expect(plan.entries.map((entry) => entry.action)).toEqual(['unchanged', 'finish-review']);
    expect(result).toMatchObject({ created: 0, published: 1 });
    expect(listings[1].status).toBe(ListingStatus.PUBLISHED);
  });

  it('reports a listing whose source item is gone and leaves it in the store', async () => {
    await syncOnce();

    const plan = await readSyncPlan(origin, buildPresetListings(CATALOG.slice(0, 1)));

    expect(plan.orphans.map((listing) => listing.packageSlug)).toEqual(['b2b-product-demo']);
    expect(listings).toHaveLength(2);
  });

  it('leaves a listing the operator rejected alone', async () => {
    await syncOnce();
    listings[0].status = ListingStatus.REJECTED;

    const { plan, result } = await syncOnce();

    expect(plan.entries[0].action).toBe('rejected');
    expect(result).toMatchObject({ created: 0, published: 0, updated: 0 });
    expect(listings[0].status).toBe(ListingStatus.REJECTED);
  });

  describe('reading the skills repository', () => {
    async function writeSkill(root: string, moduleName: string, slug: string, metadata: unknown) {
      const dir = path.join(root, moduleName, slug);
      await mkdir(path.join(dir, 'references'), { recursive: true });
      await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n---\n# ${slug}\n`);
      await writeFile(path.join(dir, 'README.md'), 'generated readme');
      await writeFile(path.join(dir, 'references', 'rules.md'), 'rules');
      await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(metadata));
    }

    it('turns each skill folder into a free listing with its files', async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'skills-'));
      await writeSkill(root, 'x', 'x-post', {
        description: 'Write a single X post.',
        name: 'x-post',
        tags: ['x'],
        triggers: ['write a tweet'],
        version: '1.2.0',
      });
      await writeSkill(root, 'ads', 'broken-skill', { name: 'someone-else' });

      const { drafts, skipped } = await readSkillListings(root);

      expect(drafts).toHaveLength(1);
      expect(drafts[0]).toMatchObject({
        downloadData: {
          description: 'Write a single X post.',
          files: [
            { content: '---\nname: x-post\n---\n# x-post\n', path: 'SKILL.md' },
            { content: 'rules', path: 'references/rules.md' },
          ],
          slug: 'x-post',
        },
        packageSlug: 'x-post',
        packageSource: 'genfeedai/skills',
        previewData: { fileCount: 2, module: 'x', triggers: ['write a tweet'] },
        price: 0,
        tags: ['skill', 'x', 'x'],
        type: 'skill',
        version: '1.2.0',
      });
      expect(skipped).toEqual([
        { reason: 'metadata.json has no description', slug: 'ads/broken-skill' },
      ]);
    });
  });
});

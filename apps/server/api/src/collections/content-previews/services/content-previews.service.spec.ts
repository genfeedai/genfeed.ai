import { hashToken } from '@api/auth/shared/pkce.util';
import { ContentPreviewsService } from '@api/collections/content-previews/services/content-previews.service';
import type { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PublicContentPreviewSerializer } from '@genfeedai/serializers';
import { beforeEach, describe, expect, it } from 'vitest';

const ORG = 'org_1';
const BRAND = 'brand_1';
const NOW = Date.now();

interface Row {
  [key: string]: unknown;
}

/** A small in-memory stand-in for the tables the preview reads and writes. */
function createFakePrisma() {
  const previews: Row[] = [];
  const posts: Row[] = [];
  const state = {
    account: {
      diagnostics: {},
      id: 'warmup_1',
      status: 'INVITED',
    } as Row | null,
    brand: {
      agentConfig: { voice: { tone: 'Warm' } },
      description: 'We make invoices simple.',
      id: BRAND,
      label: 'Acme',
      organizationId: ORG,
    } as Row,
  };
  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === 'object' && 'in' in value)
        return (value.in as unknown[]).includes(row[key]);
      if (value && typeof value === 'object' && 'not' in value)
        return row[key] !== value.not;
      return row[key] === value;
    });
  const prisma = {
    asset: { findFirst: async () => null },
    brand: { findFirst: async () => state.brand },
    contentPreview: {
      create: async ({ data }: { data: Row }) => {
        const row = {
          createdAt: new Date(NOW),
          ctaClickCount: 0,
          firstViewedAt: null,
          id: `preview_${previews.length + 1}`,
          isDeleted: false,
          lastViewedAt: null,
          revokedAt: null,
          updatedAt: new Date(NOW),
          viewCount: 0,
          ...data,
        };
        previews.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: Row }) =>
        previews.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where }: { where: Row }) =>
        previews.filter((row) => matches(row, where)),
      update: async ({ data, where }: { data: Row; where: Row }) => {
        const row = previews.find((item) => matches(item, where));
        Object.assign(row ?? {}, data);
        return row;
      },
      updateMany: async ({ data, where }: { data: Row; where: Row }) => {
        for (const row of previews.filter((item) => matches(item, where)))
          for (const [key, value] of Object.entries(data))
            row[key] =
              value && typeof value === 'object' && 'increment' in value
                ? Number(row[key]) + Number(value.increment)
                : value;
        return { count: 1 };
      },
    },
    post: {
      findMany: async ({ where }: { where: Row }) =>
        posts.filter((row) => matches(row, where)),
    },
    warmupAccount: { findFirst: async () => state.account },
  };
  return { posts, previews, prisma, state };
}

describe('ContentPreviewsService', () => {
  let fake: ReturnType<typeof createFakePrisma>;
  let service: ContentPreviewsService;

  beforeEach(() => {
    fake = createFakePrisma();
    fake.posts.push({
      brandId: BRAND,
      description: 'Invoices should take a minute.',
      id: 'post_x',
      ingredientLinks: [],
      isDeleted: false,
      organizationId: ORG,
      platform: 'twitter',
      publishedAt: null,
      status: 'draft',
    });
    service = new ContentPreviewsService(
      fake.prisma as unknown as PrismaService,
      {
        projectIngredients: async () => [],
        projectAssets: async () => [],
      } as unknown as AuthorizedMediaUrlService,
    );
  });

  async function mint(overrides: Partial<Row> = {}) {
    return service.create({
      brandId: BRAND,
      createdByUserId: 'operator_1',
      expiresAt: new Date(NOW + 14 * 24 * 60 * 60 * 1000),
      items: [{ id: 'post_x', kind: 'POST' }],
      organizationId: ORG,
      warmupAccountId: 'warmup_1',
      ...(overrides as object),
    });
  }

  it('stores only the hash of the token it hands back', async () => {
    const { preview, token } = await mint();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(preview.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(preview)).not.toContain(token);
  });

  it('mints distinct tokens for the same set, and revoking one leaves the other working', async () => {
    const first = await mint();
    const second = await mint();

    expect(first.token).not.toBe(second.token);

    await service.revoke(ORG, 'warmup_1', first.preview.id as string);

    await expect(service.readPublic(first.token)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.readPublic(second.token)).resolves.toMatchObject({
      items: [{ platform: 'twitter' }],
    });
  });

  it('answers unknown, malformed, expired, revoked and archived tokens with the same 404', async () => {
    const expired = await mint({ expiresAt: new Date(NOW - 1000) });
    const revoked = await mint();
    await service.revoke(ORG, 'warmup_1', revoked.preview.id as string);
    const archived = await mint();
    const bodies: unknown[] = [];

    for (const token of [
      'unknown-token',
      'x'.repeat(43),
      expired.token,
      revoked.token,
    ]) {
      bodies.push(
        await service
          .readPublic(token)
          .catch((error: { response: unknown }) => error.response),
      );
    }
    fake.state.account = null;
    bodies.push(
      await service
        .readPublic(archived.token)
        .catch((error: { response: unknown }) => error.response),
    );

    expect(bodies.every((body) => body !== undefined)).toBe(true);
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
  });

  it('exposes only the allowlisted fields through the serializer', async () => {
    const { token } = await mint();

    const document = PublicContentPreviewSerializer.serialize({
      id: 'preview',
      ...(await service.readPublic(token)),
    }) as { data: { attributes: Record<string, unknown>; id: string } };

    expect(Object.keys(document.data.attributes).sort()).toEqual([
      'brand',
      'expiresAt',
      'items',
    ]);
    expect(
      Object.keys(document.data.attributes.brand as object).sort(),
    ).toEqual(['name']);
    expect(JSON.stringify(document)).not.toMatch(
      /org_1|brand_1|operator_1|warmup_1|post_x|tokenHash|diagnostics|credit/i,
    );
  });

  it('drops a pinned post that was soft-deleted', async () => {
    const { token } = await mint();
    fake.posts[0].isDeleted = true;

    await expect(service.readPublic(token)).resolves.toMatchObject({
      items: [],
    });
  });

  it('counts a view and a click, and keeps the history after revoke', async () => {
    const { preview, token } = await mint();

    await service.recordView(token);
    await service.recordView(token);
    await service.recordCtaClick(token);
    await service.revoke(ORG, 'warmup_1', preview.id as string);

    expect(service.toView(fake.previews[0] as never)).toMatchObject({
      ctaClickCount: 1,
      viewCount: 2,
    });
    expect(fake.previews[0].firstViewedAt).toBeInstanceOf(Date);
    await expect(service.recordView(token)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('persists nothing about the visitor on the preview record', async () => {
    const { token } = await mint();
    await service.recordView(token);

    expect(Object.keys(fake.previews[0]).sort()).toEqual(
      [
        'brandId',
        'createdAt',
        'createdByUserId',
        'ctaClickCount',
        'expiresAt',
        'firstViewedAt',
        'id',
        'isDeleted',
        'items',
        'lastViewedAt',
        'organizationId',
        'revokedAt',
        'tokenHash',
        'updatedAt',
        'viewCount',
        'warmupAccountId',
      ].sort(),
    );
  });

  it('extends from the later of now and the current expiry and never un-revokes', async () => {
    const { preview, token } = await mint();
    const before = (preview.expiresAt as Date).getTime();

    const extended = await service.extend(
      ORG,
      'warmup_1',
      preview.id as string,
      7,
    );
    const extendedBy = (extended.expiresAt as Date).getTime() - before;
    await service.revoke(ORG, 'warmup_1', preview.id as string);
    await service.extend(ORG, 'warmup_1', preview.id as string, 7);

    expect(extendedBy).toBe(7 * 24 * 60 * 60 * 1000);
    await expect(service.readPublic(token)).rejects.toMatchObject({
      status: 404,
    });
  });
});

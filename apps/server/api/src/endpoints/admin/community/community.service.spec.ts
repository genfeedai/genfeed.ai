import { AdminCommunityService } from '@api/endpoints/admin/community/community.service';
import {
  getTenantContext,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { describe, expect, it } from 'vitest';

interface Row {
  [key: string]: unknown;
  id: string;
  isDeleted: boolean;
  isHighlighted: boolean;
  organizationId: string;
  scope: string;
}

interface MediaRow extends Row {
  brandId: string | null;
  category: string;
  cdnUrl: string | null;
  createdAt: Date;
  metadata: { label: string } | null;
  status: string;
}

interface BrandRow extends Row {
  createdAt: Date;
  label: string;
  slug: string;
}

type Where = Record<string, unknown>;

/** The subset of Prisma `where` the service writes: equality and `in`. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (
      expected !== null &&
      typeof expected === 'object' &&
      'in' in (expected as Record<string, unknown>)
    ) {
      return (expected as { in: unknown[] }).in.includes(row[key]);
    }
    return row[key] === expected;
  });
}

function table<T extends Row>(rows: T[]) {
  return {
    count: async ({ where }: { where: Where }) =>
      rows.filter((row) => matches(row, where)).length,
    findMany: async ({
      skip = 0,
      take,
      where,
    }: {
      skip?: number;
      take?: number;
      where: Where;
    }) => {
      const hits = rows
        .filter((row) => matches(row, where))
        .sort(
          (a, b) =>
            Number(b.isHighlighted) - Number(a.isHighlighted) ||
            (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
        );
      return hits.slice(skip, take === undefined ? undefined : skip + take);
    },
    // Lazy like a Prisma query: it runs when awaited, under whatever tenant
    // is active then, and the tenant guard refuses a mismatch.
    updateMany: ({ data, where }: { data: Where; where: Where }) => ({
      // biome-ignore lint/suspicious/noThenProperty: a Prisma query is a lazy thenable
      then<R>(
        resolve: (value: { count: number }) => R,
        reject: (reason: unknown) => R,
      ) {
        try {
          if (getTenantContext()?.organizationId !== where.organizationId) {
            throw new Error(
              `Tenant isolation: updateMany used organizationId ${String(where.organizationId)} but the request tenant is ${getTenantContext()?.organizationId}.`,
            );
          }
          const hits = rows.filter((row) => matches(row, where));
          for (const row of hits) {
            Object.assign(row, data);
          }
          return resolve({ count: hits.length });
        } catch (error) {
          return reject(error);
        }
      },
    }),
  };
}

function createWorld({
  brands = [],
  media = [],
}: {
  brands?: BrandRow[];
  media?: MediaRow[];
}) {
  const invalidated: string[][] = [];
  const service = new AdminCommunityService(
    { brand: table(brands), ingredient: table(media) } as never,
    {
      invalidateByTags: async (tags: string[]) => {
        invalidated.push(tags);
        return 0;
      },
    } as never,
  );
  return { invalidated, service };
}

function video(overrides: Partial<MediaRow> = {}): MediaRow {
  return {
    brandId: 'brand-1',
    category: 'VIDEO',
    cdnUrl: 'https://cdn.genfeed.ai/ingredients/videos/video-1',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    id: 'video-1',
    isDeleted: false,
    isHighlighted: false,
    metadata: { label: 'Sunset run' },
    organizationId: 'org-1',
    scope: 'PUBLIC',
    status: 'GENERATED',
    ...overrides,
  };
}

function creator(overrides: Partial<BrandRow> = {}): BrandRow {
  return {
    createdAt: new Date('2026-10-01T00:00:00Z'),
    id: 'brand-1',
    isDeleted: false,
    isHighlighted: false,
    label: 'Shayla Monroe',
    organizationId: 'org-1',
    scope: 'PUBLIC',
    slug: 'itsshaylamonroe',
    ...overrides,
  };
}

describe('AdminCommunityService', () => {
  it("lists the organization's public creators and media, featured first", async () => {
    const { service } = createWorld({
      brands: [
        creator(),
        creator({ id: 'brand-2', scope: 'ORGANIZATION', slug: 'private' }),
        creator({ id: 'brand-3', organizationId: 'org-2', slug: 'other' }),
      ],
      media: [
        video(),
        video({
          category: 'IMAGE',
          cdnUrl: 'https://cdn.genfeed.ai/ingredients/images/image-1',
          createdAt: new Date('2026-10-01T00:00:00Z'),
          id: 'image-1',
          isHighlighted: true,
          metadata: null,
        }),
        video({ id: 'draft', status: 'PROCESSING' }),
        video({ id: 'audio', category: 'MUSIC' }),
        video({ id: 'private', scope: 'BRAND' }),
        video({ id: 'deleted', isDeleted: true }),
        video({ id: 'elsewhere', organizationId: 'org-2' }),
      ],
    });

    await expect(service.getOverview('org-1', 1)).resolves.toEqual({
      creators: [
        {
          createdAt: '2026-10-01T00:00:00.000Z',
          handle: 'itsshaylamonroe',
          id: 'brand-1',
          isFeatured: false,
          label: 'Shayla Monroe',
        },
      ],
      media: [
        {
          brandId: 'brand-1',
          createdAt: '2026-10-01T00:00:00.000Z',
          id: 'image-1',
          isFeatured: true,
          kind: 'image',
          label: '',
          url: 'https://cdn.genfeed.ai/ingredients/images/image-1',
        },
        {
          brandId: 'brand-1',
          createdAt: '2026-11-01T00:00:00.000Z',
          id: 'video-1',
          isFeatured: false,
          kind: 'video',
          label: 'Sunset run',
          url: 'https://cdn.genfeed.ai/ingredients/videos/video-1',
        },
      ],
      mediaTotal: 2,
    });
  });

  it('features and unfeatures a public video, and clears the community caches', async () => {
    const row = video();
    const { invalidated, service } = createWorld({ media: [row] });

    await expect(
      service.setMediaFeatured('org-1', 'video-1', true),
    ).resolves.toEqual({ id: 'video-1', isFeatured: true });
    expect(row.isHighlighted).toBe(true);

    await service.setMediaFeatured('org-1', 'video-1', false);
    expect(row.isHighlighted).toBe(false);
    expect(invalidated).toEqual([
      ['brands', 'images', 'public', 'slugs', 'videos'],
      ['brands', 'images', 'public', 'slugs', 'videos'],
    ]);
  });

  it('takes a featured video off community and leaves it with the organization', async () => {
    const row = video({ isHighlighted: true });
    const { service } = createWorld({ media: [row] });

    await expect(service.unpublishMedia('org-1', 'video-1')).resolves.toEqual({
      id: 'video-1',
    });
    expect(row).toMatchObject({
      isDeleted: false,
      isHighlighted: false,
      scope: 'ORGANIZATION',
    });
    await expect(service.getOverview('org-1', 1)).resolves.toMatchObject({
      media: [],
      mediaTotal: 0,
    });
  });

  it.each([
    ['private', { scope: 'ORGANIZATION' }],
    ['deleted', { isDeleted: true }],
    ['still processing', { status: 'PROCESSING' }],
    ['not an image or video', { category: 'MUSIC' }],
    ['in another organization', { organizationId: 'org-2' }],
  ])('refuses media that is %s', async (_label, change) => {
    const row = video(change);
    const { invalidated, service } = createWorld({ media: [row] });

    await expect(
      service.setMediaFeatured('org-1', 'video-1', true),
    ).rejects.toThrow();
    await expect(service.unpublishMedia('org-1', 'video-1')).rejects.toThrow();
    expect(row).toMatchObject({ isHighlighted: false, ...change });
    expect(invalidated).toEqual([]);
  });

  it("takes another organization's creator off community when an admin from a different organization asks", async () => {
    const row = creator({ organizationId: 'org-2' });
    const { service } = createWorld({ brands: [row] });

    await runWithTenantContext({ organizationId: 'admin-org' }, () =>
      service.unpublishCreator('org-2', 'brand-1'),
    );

    expect(row.scope).toBe('ORGANIZATION');
  });

  it("features another organization's video when an admin from a different organization asks", async () => {
    const row = video({ organizationId: 'org-2' });
    const { service } = createWorld({ media: [row] });

    await runWithTenantContext({ organizationId: 'admin-org' }, () =>
      service.setMediaFeatured('org-2', 'video-1', true),
    );

    expect(row.isHighlighted).toBe(true);
  });

  it('features a public creator, then takes the profile off genfeed.ai', async () => {
    const row = creator();
    const { service } = createWorld({ brands: [row] });

    await expect(
      service.setCreatorFeatured('org-1', 'brand-1', true),
    ).resolves.toEqual({ id: 'brand-1', isFeatured: true });
    expect(row.isHighlighted).toBe(true);

    await service.unpublishCreator('org-1', 'brand-1');
    expect(row).toMatchObject({
      isDeleted: false,
      isHighlighted: false,
      scope: 'ORGANIZATION',
    });
  });

  it.each([
    ['private', { scope: 'BRAND' }],
    ['deleted', { isDeleted: true }],
    ['in another organization', { organizationId: 'org-2' }],
  ])('refuses a creator that is %s', async (_label, change) => {
    const row = creator(change);
    const { service } = createWorld({ brands: [row] });

    await expect(
      service.setCreatorFeatured('org-1', 'brand-1', true),
    ).rejects.toThrow();
    await expect(
      service.unpublishCreator('org-1', 'brand-1'),
    ).rejects.toThrow();
    expect(row).toMatchObject({ isHighlighted: false, ...change });
  });
});

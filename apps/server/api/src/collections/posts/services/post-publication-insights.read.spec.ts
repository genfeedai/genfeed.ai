import {
  findPublicationInsight,
  listPublicationInsights,
} from '@api/collections/posts/services/post-publication-insights.read';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

const scope = { organizationId: 'org', brandId: 'brand', userId: 'user' };
const row = {
  id: 'post',
  organizationId: 'org',
  brandId: 'brand',
  source: 'manual',
  description: 'original',
  platform: 'twitter',
  externalId: '123',
  url: 'https://x.com/alice/status/123?tracking=old',
  credentialId: 'credential',
  visibility: null,
  targetSettings: {},
  publicationDate: null,
  analyticsCollectionState: 'unavailable',
};
function fixture(rows: object[] = [row], samples: object[] = []) {
  const post = {
    count: vi.fn().mockResolvedValue(21),
    findMany: vi.fn().mockResolvedValue(rows),
    findFirst: vi.fn().mockResolvedValue(rows[0] ?? null),
  };
  const credential = {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'credential',
        platform: 'TWITTER',
        externalId: 'alice-id',
        externalHandle: '@Alice',
        username: 'alice',
      },
    ]),
  };
  const raw = vi.fn().mockResolvedValue(samples);
  const brand = { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) };
  return {
    post,
    credential,
    raw,
    brand,
    prisma: {
      post,
      credential,
      brand,
      $queryRaw: raw,
    } as unknown as PrismaService,
  };
}
describe('publication insights scoped read model', () => {
  it('keeps original source replay, scopes count identically and uses canonical pagination', async () => {
    const f = fixture();
    const data = await listPublicationInsights(
      f.prisma,
      {
        brandId: 'brand',
        platform: 'twitter',
        pageUrl: 'https://x.com/alice/status/123',
        externalId: '123',
        page: 2,
        limit: 10,
      },
      scope,
    );
    expect(data).toMatchObject({
      totalDocs: 21,
      page: 2,
      limit: 10,
      totalPages: 3,
      pagingCounter: 11,
      prevPage: 1,
      nextPage: 3,
      hasPrevPage: true,
      hasNextPage: true,
    });
    const where = f.post.findMany.mock.calls[0][0].where;
    expect(where).toEqual(f.post.count.mock.calls[0][0].where);
    expect(where).toMatchObject({
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: false,
      brand: { organizationId: 'org', isDeleted: false },
      targetExecutionState: 'published',
      platform: 'twitter',
      externalId: '123',
    });
    expect(where.source).toBeUndefined();
    expect(where.AND[0].OR).toContainEqual({ externalId: '123' });
    expect(f.post.findMany.mock.calls[0][0]).toMatchObject({
      take: 10,
      skip: 10,
      orderBy: [
        { publicationDate: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
    });
    expect(data.docs[0]).toMatchObject({
      source: 'manual',
      isCapturedObservation: false,
      publicationKind: 'post',
      observedVisibility: 'unknown',
      url: row.url,
      analyticsAvailability: 'eligible',
      collectionState: 'pending',
      latestSample: null,
      linkCandidates: [],
    });
    expect(f.credential.findMany).toHaveBeenCalledTimes(1);
    expect(f.credential.findMany.mock.calls[0][0]).toEqual({
      where: {
        organizationId: 'org',
        brandId: 'brand',
        isDeleted: false,
        isConnected: true,
        platform: { in: ['TWITTER'] },
      },
      select: {
        id: true,
        externalId: true,
        externalHandle: true,
        username: true,
        platform: true,
      },
    });
  });
  it('keeps source and captured-only filters independent', async () => {
    const f = fixture([]);
    await listPublicationInsights(
      f.prisma,
      {
        brandId: 'brand',
        source: 'extension',
        capturedOnly: true,
        credentialId: ['credential'],
        search: 'words',
      },
      scope,
    );
    expect(f.post.findMany.mock.calls[0][0].where).toMatchObject({
      source: 'extension',
      credentialId: { in: ['credential'] },
      AND: [
        {
          OR: [
            { label: { contains: 'words', mode: 'insensitive' } },
            { description: { contains: 'words', mode: 'insensitive' } },
          ],
        },
        {
          source: 'extension',
          targetSettings: { path: ['extensionCapture', 'version'], equals: 1 },
        },
      ],
    });
    expect(f.raw).not.toHaveBeenCalled();
    expect(f.credential.findMany).not.toHaveBeenCalled();
  });
  it('returns multiple context replies without manufacturing IDs or choosing an account', async () => {
    const captured = {
      ...row,
      source: 'extension',
      visibility: 'private',
      credentialId: null,
      externalId: null,
      url: null,
      targetSettings: {
        extensionCapture: {
          version: 1,
          publicationKind: 'reply',
          contextUrl: 'https://twitter.com/alice/status/123',
          author: { handle: 'alice' },
          observedVisibility: 'private',
        },
      },
    };
    const f = fixture([captured, { ...captured, id: 'reply2' }]);
    const data = await listPublicationInsights(
      f.prisma,
      {
        brandId: 'brand',
        platform: 'twitter',
        pageUrl: 'https://x.com/alice/status/123',
      },
      scope,
    );
    expect(data.docs).toHaveLength(2);
    expect(data.docs[0]).toMatchObject({
      url: null,
      contextUrl: 'https://twitter.com/alice/status/123',
      urlKind: 'context-only',
      externalId: null,
      observedVisibility: 'private',
      credentialId: null,
      linkCandidates: [{ id: 'credential', label: '@Alice' }],
    });
    expect(JSON.stringify(data)).not.toContain('alice-id');
    expect(JSON.stringify(data)).not.toContain('targetSettings');
  });
  it('never looks up a YouTube comment with its parent video ID', async () => {
    const f = fixture([]);
    await listPublicationInsights(
      f.prisma,
      {
        brandId: 'brand',
        platform: 'youtube',
        pageUrl: 'https://youtube.com/watch?v=abcdefghijk&lc=Ugycomment',
      },
      scope,
    );
    const alternatives = f.post.findMany.mock.calls[0][0].where.AND[0].OR;
    expect(alternatives).toContainEqual({ externalId: 'Ugycomment' });
    expect(alternatives).not.toContainEqual({ externalId: 'abcdefghijk' });
  });
  it('does not promote Instagram URL tokens to provider IDs', async () => {
    const f = fixture([]);
    await listPublicationInsights(
      f.prisma,
      {
        brandId: 'brand',
        platform: 'instagram',
        pageUrl: 'https://www.instagram.com/p/ShortCode/',
      },
      scope,
    );
    const branches = f.post.findMany.mock.calls[0][0].where.AND[0].OR;
    expect(branches.some((branch: object) => 'externalId' in branch)).toBe(
      false,
    );
    expect(branches[0].url.in).toContain('https://instagram.com/p/ShortCode');
  });

  it('projects saved metrics honestly and proves bound latest-row SQL ordering', async () => {
    const sample = {
      postId: 'post',
      platform: 'TWITTER',
      date: new Date('2026-01-02'),
      updatedAt: new Date('2026-01-03'),
      totalViews: 0,
      totalLikes: 0,
      totalComments: 9,
      totalShares: 88,
      totalSaves: 1,
      metricAvailability: {
        views: 'observed',
        shares: 'failed',
        saves: 'future-unknown',
      },
    };
    const f = fixture([row], [sample]);
    const { docs } = await listPublicationInsights(
      f.prisma,
      { brandId: 'brand' },
      scope,
    );
    expect(docs[0].latestSample).toEqual({
      date: sample.date.toISOString(),
      updatedAt: sample.updatedAt.toISOString(),
      metrics: {
        views: { value: 0, availability: 'observed' },
        likes: { value: null, availability: 'unavailable' },
        comments: { value: 9, availability: 'observed' },
        shares: { value: null, availability: 'failed' },
        saves: { value: null, availability: 'unavailable' },
      },
    });
    const sql = f.raw.mock.calls[0][0];
    expect(sql.values).toEqual(['org', 'brand', 'post']);
    expect(sql.sql).toContain('DISTINCT ON (pa."postId", pa.platform)');
    expect(sql.sql).toContain('p.platform=lower(pa.platform::text)');
    expect(sql.sql).toContain('pa.date DESC, pa."updatedAt" DESC, pa.id ASC');
    expect(sql.sql).toContain('p."isDeleted"=false');
  });
  it('treats disconnected credentials as missing and hides raw provider failures', async () => {
    const f = fixture([
      {
        ...row,
        analyticsCollectionState: 'failed',
        analyticsCollectionError: { provider: 'SECRET' },
      },
    ]);
    f.credential.findMany.mockResolvedValue([]);
    const { docs } = await listPublicationInsights(
      f.prisma,
      { brandId: 'brand' },
      scope,
    );
    expect(docs[0].analyticsAvailability).toBe('missing-credential');
    expect(JSON.stringify(docs)).not.toContain('SECRET');
  });
  it('fails closed for missing brand and returns ordinary missing detail', async () => {
    const f = fixture([]);
    expect(await findPublicationInsight(f.prisma, 'foreign', scope)).toBeNull();
    expect(f.post.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'foreign',
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: false,
    });
    f.brand.findFirst.mockResolvedValue(null);
    await expect(
      listPublicationInsights(f.prisma, { brandId: 'brand' }, scope),
    ).rejects.toThrow();
    expect(f.post.findMany).not.toHaveBeenCalled();
  });
  it.each([
    ['twitter', 'https://x.com/alice/status/123?commentUrn=unrelated'],
    ['instagram', 'https://instagram.com/p/abc?comment_id=unrelated'],
    ['tiktok', 'https://tiktok.com/@alice/video/123?comment_id=unrelated'],
    ['facebook', 'https://facebook.com/alice/posts/123?lc=unrelated'],
  ] as const)(
    'accepts unrelated query keys for %s',
    async (platform, pageUrl) => {
      const f = fixture([]);
      await listPublicationInsights(
        f.prisma,
        { brandId: 'brand', platform, pageUrl },
        scope,
      );
      const serialized = JSON.stringify(f.post.findMany.mock.calls[0][0].where);
      expect(serialized).not.toContain('unrelated');
      if (platform === 'instagram')
        expect(serialized).not.toContain('"externalId"');
    },
  );
  it.each([
    ['youtube', 'https://youtube.com/watch?v=abcdefghijk&lc='],
    ['youtube', 'https://youtube.com/watch?v=abcdefghijk&lc=x&lc=y'],
    [
      'linkedin',
      'https://linkedin.com/feed/update/urn:li:activity:123?commentUrn=',
    ],
    ['facebook', 'https://facebook.com/alice/posts/123?comment_id='],
    ['reddit', 'https://reddit.com/comments/abc/slug/%ZZ'],
  ] as const)(
    'rejects invalid reply lookup for %s without fallback',
    async (platform, pageUrl) => {
      const f = fixture([]);
      await expect(
        listPublicationInsights(
          f.prisma,
          { brandId: 'brand', platform, pageUrl },
          scope,
        ),
      ).rejects.toThrow();
      expect(f.post.findMany).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['youtube', 'https://youtube.com/watch?v=abcdefghijk&lc=Ugycomment'],
    ['facebook', 'https://facebook.com/alice/posts/123?comment_id=456'],
    ['facebook', 'https://facebook.com/alice/posts/123?reply_comment_id=456'],
    ['reddit', 'https://reddit.com/r/sub/comments/abc/slug/def/'],
    ['reddit', 'https://reddit.com/comments/abc/slug/def'],
    ['reddit', 'https://reddit.com/%72/sub/%63omments/abc/slug/def'],
  ] as const)(
    'accepts canonical reply lookup for %s',
    async (platform, pageUrl) => {
      const f = fixture([]);
      await listPublicationInsights(
        f.prisma,
        { brandId: 'brand', platform, pageUrl },
        scope,
      );
      expect(f.post.findMany).toHaveBeenCalledTimes(1);
    },
  );
});

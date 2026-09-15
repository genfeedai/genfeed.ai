import {
  normalizeOutlierContentType,
  OutlierInputsService,
  readOutlierFlag,
} from '@api/collections/outliers/services/outlier-inputs.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

describe('Outlier inputs', () => {
  it.each([
    ['tweet', 'caption'],
    ['text', 'caption'],
    ['post', 'caption'],
    ['reel', 'video'],
    ['short', 'video'],
    ['photo', 'image'],
    ['story', 'image'],
    ['article', 'article'],
    ['document', 'document'],
  ])('canonicalizes %s', (input, output) =>
    expect(normalizeOutlierContentType(input)).toBe(output),
  );
  it('preserves unknown booleans', () => {
    expect(readOutlierFlag({}, ['isPinned'])).toBeNull();
    expect(readOutlierFlag({ isPinned: 'false' }, ['isPinned'])).toBeNull();
    expect(readOutlierFlag({ isPinned: false }, ['isPinned'])).toBe(false);
  });
  it('rejects a deleted or cross-tenant account before history reads', async () => {
    const credential = { findFirst: vi.fn().mockResolvedValue(null) };
    const service = new OutlierInputsService({
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
      credential,
    } as unknown as PrismaService);
    await expect(
      service.authorize({
        organizationId: 'org',
        brandId: 'brand',
        accountType: 'credential',
        accountId: 'other',
      }),
    ).rejects.toThrow();
    expect(credential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          brandId: 'brand',
          id: 'other',
          isDeleted: false,
        },
      }),
    );
  });
});

const account = {
  organizationId: 'org',
  brandId: 'brand',
  accountType: 'credential' as const,
  accountId: 'account',
  platform: 'twitter',
};
function inputHarness() {
  const sourcePost = { findMany: vi.fn().mockResolvedValue([]) };
  const postAnalytics = { findMany: vi.fn().mockResolvedValue([]) };
  const socialSource = {
    findMany: vi.fn().mockResolvedValue([{ id: 'source' }]),
  };
  return {
    sourcePost,
    postAnalytics,
    socialSource,
    service: new OutlierInputsService({
      sourcePost,
      postAnalytics,
      socialSource,
    } as unknown as PrismaService),
  };
}
describe('outlier account history adapters', () => {
  it('deduplicates own-source and analytics by external ID, preferring own on timestamp ties', async () => {
    const h = inputHarness();
    const at = new Date('2026-01-01');
    h.sourcePost.findMany.mockResolvedValue([
      {
        id: 'sp',
        sourceId: 'source',
        externalId: 'external',
        contentType: 'tweet',
        publishedAt: at,
        metrics: { views: 100 },
        raw: { is_pinned: true },
        updatedAt: at,
        collectedAt: at,
      },
    ]);
    h.postAnalytics.findMany.mockResolvedValue([
      {
        id: 'analytics',
        credentialId: 'account',
        totalViews: 200,
        metricAvailability: { views: 'observed' },
        isPinned: null,
        isPromoted: null,
        updatedAt: at,
        post: {
          id: 'post',
          credentialId: 'account',
          externalId: 'external',
          category: 'TEXT',
          publishedAt: at,
          publicationDate: null,
        },
      },
    ]);
    const result = await h.service.read(account);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      postId: 'post',
      sourcePostId: null,
      views: 200,
      contentType: 'caption',
      isPinned: null,
    });
    expect(h.postAnalytics.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: false,
      platform: 'TWITTER',
    });
  });
  it('uses latest observations and keeps unavailable views and missing dates invalid', async () => {
    const h = inputHarness();
    h.postAnalytics.findMany.mockResolvedValue(
      [1, 2].map((i) => ({
        id: `a${i}`,
        credentialId: 'account',
        totalViews: i * 100,
        metricAvailability: { views: i === 2 ? 'unavailable' : 'observed' },
        isPinned: null,
        isPromoted: null,
        updatedAt: new Date(i * 1000),
        post: {
          id: 'p',
          credentialId: 'account',
          externalId: 'ext',
          category: 'VIDEO',
          publishedAt: null,
          publicationDate: null,
        },
      })),
    );
    const [result] = await h.service.read(account);
    expect(result.views).toBeNull();
    expect(Number.isNaN(result.publishedAtMs)).toBe(true);
    expect(result.sourceIdentity).toBe('analytics:a2');
  });
  it('never reads own analytics for external accounts and retains canonical flags', async () => {
    const h = inputHarness();
    h.sourcePost.findMany.mockResolvedValue([
      {
        id: 'sp',
        sourceId: 'source',
        externalId: 'ext',
        contentType: 'reel',
        publishedAt: null,
        metrics: { views: 0 },
        raw: { isSponsored: true, pinned: false },
        updatedAt: new Date(),
        collectedAt: new Date(),
      },
    ]);
    const [result] = await h.service.read({
      ...account,
      accountType: 'social_source',
    });
    expect(h.postAnalytics.findMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      views: 0,
      isPinned: false,
      isPromoted: true,
      contentType: 'video',
    });
  });
  it('fails explicitly after the paginated 10000-record safety limit', async () => {
    const h = inputHarness();
    h.sourcePost.findMany.mockResolvedValue(
      Array.from({ length: 200 }, (_, i) => ({
        id: String(i),
        sourceId: 'source',
        externalId: String(i),
        contentType: 'caption',
        publishedAt: null,
        metrics: {},
        raw: {},
        updatedAt: new Date(),
        collectedAt: new Date(),
      })),
    );
    await expect(h.service.read(account)).rejects.toThrow('10000-record');
    expect(h.sourcePost.findMany).toHaveBeenCalledTimes(51);
  });
  it('rejects conflicting canonical credential references', async () => {
    const h = inputHarness();
    h.postAnalytics.findMany.mockResolvedValue([
      {
        id: 'a',
        credentialId: 'account',
        post: { credentialId: 'other' },
        metricAvailability: {},
      },
    ]);
    await expect(h.service.read(account)).rejects.toThrow('disagrees');
  });
});

describe('outlier account authorization', () => {
  it('rejects missing, deleted and cross-organization brands before reading account history', async () => {
    const credential = { findFirst: vi.fn() };
    const service = new OutlierInputsService({
      brand: { findFirst: vi.fn().mockResolvedValue(null) },
      credential,
    } as unknown as PrismaService);
    await expect(service.authorize(account)).rejects.toThrow('not found');
    expect(credential.findFirst).not.toHaveBeenCalled();
  });
  it('resolves an own source only through its valid linked credential', async () => {
    const credential = {
      findFirst: vi.fn().mockResolvedValue({ platform: 'TWITTER' }),
    };
    const socialSource = {
      findFirst: vi.fn().mockResolvedValue({
        platform: 'twitter',
        sourceType: 'own-account',
        credentialId: 'linked',
      }),
    };
    const service = new OutlierInputsService({
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
      credential,
      socialSource,
    } as unknown as PrismaService);
    expect(
      await service.authorize({ ...account, accountType: 'social_source' }),
    ).toMatchObject({ accountType: 'credential', accountId: 'linked' });
    expect(credential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'linked',
          organizationId: 'org',
          brandId: 'brand',
          isDeleted: false,
        },
      }),
    );
  });
  it('rejects isolated post containers', async () => {
    const service = new OutlierInputsService({
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
      socialSource: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ platform: 'twitter', sourceType: 'post' }),
      },
    } as unknown as PrismaService);
    await expect(
      service.authorize({ ...account, accountType: 'social_source' }),
    ).rejects.toThrow('not found');
  });
});

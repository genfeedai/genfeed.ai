vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ListeningTopicsService } from '@api/collections/listening-topics/services/listening-topics.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ListeningSourcePlatform } from '@genfeedai/enums';

describe('ListeningTopicsService', () => {
  const listeningTopic = {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const listeningEvidence = {
    count: vi.fn(),
    findMany: vi.fn(),
  };
  const socialSource = {
    findMany: vi.fn(),
  };
  const cacheInvalidationService = {
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidateByTags: vi.fn().mockResolvedValue(0),
  };

  let service: ListeningTopicsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ListeningTopicsService(
      {
        listeningEvidence,
        listeningTopic,
        socialSource,
      } as unknown as PrismaService,
      cacheInvalidationService as never,
    );
  });

  it('normalizes and persists an authorized topic contract', async () => {
    socialSource.findMany.mockResolvedValue([
      { id: 'source-1', platform: ListeningSourcePlatform.TWITTER },
    ]);
    listeningTopic.findFirst.mockResolvedValue(null);
    listeningTopic.create.mockImplementation(async ({ data }) => ({
      ...data,
      id: 'topic-1',
      sources: data.sources.create.map(
        (source: Record<string, unknown>, index: number) => ({
          ...source,
          createdAt: new Date(),
          id: `topic-source-${index + 1}`,
          topicId: 'topic-1',
        }),
      ),
    }));

    const topic = await service.createScoped(
      {
        keywords: [' AI Agents ', 'ai agents', 'Open Source'],
        label: ' Agent adoption ',
        languages: ['EN', 'en'],
        sourceIds: ['source-1'],
      },
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
    );

    expect(socialSource.findMany).toHaveBeenCalledWith({
      select: { id: true, platform: true },
      where: {
        brandId: 'brand-1',
        id: { in: ['source-1'] },
        isActive: true,
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(listeningTopic.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandId: 'brand-1',
          keywords: ['ai agents', 'open source'],
          label: 'Agent adoption',
          languages: ['en'],
          organizationId: 'org-1',
          sources: {
            create: [
              {
                platform: ListeningSourcePlatform.TWITTER,
                sourceId: 'source-1',
              },
            ],
          },
          userId: 'user-1',
        }),
      }),
    );
    expect(topic.id).toBe('topic-1');
    expect(cacheInvalidationService.invalidate).toHaveBeenCalledWith(
      'listeningTopics:list:org-1',
      'listeningTopics:single:topic-1',
    );
    expect(cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith([
      'listeningTopics',
    ]);
  });

  it('returns the existing scoped topic for an identical contract', async () => {
    socialSource.findMany.mockResolvedValue([
      { id: 'source-1', platform: ListeningSourcePlatform.TWITTER },
    ]);
    listeningTopic.findFirst.mockResolvedValue({
      id: 'topic-existing',
      sources: [],
    });

    const topic = await service.createScoped(
      {
        keywords: ['AI'],
        label: 'AI',
        sourceIds: ['source-1'],
      },
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
    );

    expect(topic.id).toBe('topic-existing');
    expect(listeningTopic.create).not.toHaveBeenCalled();
  });

  it('returns the concurrent winner when idempotent creates race', async () => {
    socialSource.findMany.mockResolvedValue([
      { id: 'source-1', platform: ListeningSourcePlatform.TWITTER },
    ]);
    listeningTopic.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'topic-winner', sources: [] });
    listeningTopic.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint violation'), {
        code: 'P2002',
        meta: {
          target: ['organizationId', 'brandId', 'fingerprint'],
        },
      }),
    );

    const topic = await service.createScoped(
      {
        keywords: ['AI'],
        label: 'AI',
        sourceIds: ['source-1'],
      },
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
    );

    expect(topic.id).toBe('topic-winner');
    expect(listeningTopic.findFirst).toHaveBeenCalledTimes(2);
    expect(cacheInvalidationService.invalidate).toHaveBeenCalledWith(
      'listeningTopics:list:org-1',
      'listeningTopics:single:topic-winner',
    );
  });

  it('rethrows unrelated unique violations during create', async () => {
    const unrelatedError = Object.assign(
      new Error('Unrelated unique constraint violation'),
      {
        code: 'P2002',
        meta: { target: ['externalId'] },
      },
    );
    socialSource.findMany.mockResolvedValue([
      { id: 'source-1', platform: ListeningSourcePlatform.TWITTER },
    ]);
    listeningTopic.findFirst.mockResolvedValue(null);
    listeningTopic.create.mockRejectedValue(unrelatedError);

    await expect(
      service.createScoped(
        {
          keywords: ['AI'],
          label: 'AI',
          sourceIds: ['source-1'],
        },
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      ),
    ).rejects.toBe(unrelatedError);
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });

  it('rejects unavailable or cross-tenant sources before writing', async () => {
    socialSource.findMany.mockResolvedValue([]);

    await expect(
      service.createScoped(
        {
          keywords: ['AI'],
          label: 'AI',
          sourceIds: ['foreign-source'],
        },
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      ),
    ).rejects.toThrow(
      'One or more listening sources are unavailable for this brand',
    );

    expect(listeningTopic.findFirst).not.toHaveBeenCalled();
    expect(listeningTopic.create).not.toHaveBeenCalled();
  });

  it('rejects sources outside the listening platform contract', async () => {
    socialSource.findMany.mockResolvedValue([
      { id: 'source-1', platform: 'tiktok' },
    ]);

    await expect(
      service.createScoped(
        {
          keywords: ['AI'],
          label: 'AI',
          sourceIds: ['source-1'],
        },
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      ),
    ).rejects.toThrow('Listening source platform is not supported: tiktok');

    expect(listeningTopic.findFirst).not.toHaveBeenCalled();
    expect(listeningTopic.create).not.toHaveBeenCalled();
  });

  it('updates source memberships without recreating retained sources', async () => {
    listeningTopic.findFirst
      .mockResolvedValueOnce({
        description: null,
        excludedKeywords: [],
        freshnessHours: 24,
        id: 'topic-1',
        isActive: true,
        keywords: ['ai'],
        label: 'AI',
        languages: ['en'],
        sources: [{ sourceId: 'source-1' }, { sourceId: 'source-2' }],
      })
      .mockResolvedValueOnce(null);
    socialSource.findMany.mockResolvedValue([
      { id: 'source-1', platform: ListeningSourcePlatform.TWITTER },
      { id: 'source-3', platform: ListeningSourcePlatform.REDDIT },
    ]);
    listeningTopic.update.mockResolvedValue({
      id: 'topic-1',
      sources: [],
    });

    await service.updateScoped(
      'topic-1',
      { sourceIds: ['source-1', 'source-3'] },
      { brandId: 'brand-1', organizationId: 'org-1' },
    );

    expect(listeningTopic.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sources: {
            updateMany: {
              data: { isDeleted: true },
              where: {
                isDeleted: false,
                sourceId: { in: ['source-2'] },
              },
            },
            upsert: [
              {
                create: {
                  platform: ListeningSourcePlatform.REDDIT,
                  sourceId: 'source-3',
                },
                update: {
                  isDeleted: false,
                  platform: ListeningSourcePlatform.REDDIT,
                },
                where: {
                  topicId_sourceId: {
                    sourceId: 'source-3',
                    topicId: 'topic-1',
                  },
                },
              },
            ],
          },
        }),
        where: {
          brandId: 'brand-1',
          id: 'topic-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(cacheInvalidationService.invalidate).toHaveBeenCalledWith(
      'listeningTopics:list:org-1',
      'listeningTopics:single:topic-1',
    );
  });

  it('maps a concurrent fingerprint update race to a conflict', async () => {
    listeningTopic.findFirst
      .mockResolvedValueOnce({
        description: null,
        excludedKeywords: [],
        freshnessHours: 24,
        id: 'topic-1',
        isActive: true,
        keywords: ['ai'],
        label: 'AI',
        languages: ['en'],
        sources: [{ sourceId: 'source-1' }],
      })
      .mockResolvedValueOnce(null);
    socialSource.findMany.mockResolvedValue([
      { id: 'source-1', platform: ListeningSourcePlatform.TWITTER },
    ]);
    listeningTopic.update.mockRejectedValue(
      Object.assign(new Error('Unique constraint violation'), {
        code: 'P2002',
        meta: {
          target: ['organizationId', 'brandId', 'fingerprint'],
        },
      }),
    );

    await expect(
      service.updateScoped(
        'topic-1',
        { label: 'Updated' },
        { brandId: 'brand-1', organizationId: 'org-1' },
      ),
    ).rejects.toThrow(
      'An equivalent listening topic already exists for this brand',
    );
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });

  it('rethrows unrelated unique violations during update', async () => {
    const unrelatedError = Object.assign(
      new Error('Unrelated unique constraint violation'),
      {
        code: 'P2002',
        meta: { target: ['externalId'] },
      },
    );
    listeningTopic.findFirst
      .mockResolvedValueOnce({
        description: null,
        excludedKeywords: [],
        freshnessHours: 24,
        id: 'topic-1',
        isActive: true,
        keywords: ['ai'],
        label: 'AI',
        languages: ['en'],
        sources: [{ sourceId: 'source-1' }],
      })
      .mockResolvedValueOnce(null);
    socialSource.findMany.mockResolvedValue([
      { id: 'source-1', platform: ListeningSourcePlatform.TWITTER },
    ]);
    listeningTopic.update.mockRejectedValue(unrelatedError);

    await expect(
      service.updateScoped(
        'topic-1',
        { label: 'Updated' },
        { brandId: 'brand-1', organizationId: 'org-1' },
      ),
    ).rejects.toBe(unrelatedError);
  });

  it('maps a concurrent topic removal during update to not found', async () => {
    listeningTopic.findFirst
      .mockResolvedValueOnce({
        description: null,
        excludedKeywords: [],
        freshnessHours: 24,
        id: 'topic-1',
        isActive: true,
        keywords: ['ai'],
        label: 'AI',
        languages: ['en'],
        sources: [{ sourceId: 'source-1' }],
      })
      .mockResolvedValueOnce(null);
    socialSource.findMany.mockResolvedValue([
      { id: 'source-1', platform: ListeningSourcePlatform.TWITTER },
    ]);
    listeningTopic.update.mockRejectedValue(
      Object.assign(new Error('Record not found'), { code: 'P2025' }),
    );

    await expect(
      service.updateScoped(
        'topic-1',
        { label: 'Updated' },
        { brandId: 'brand-1', organizationId: 'org-1' },
      ),
    ).rejects.toThrow('Listening topic not found');
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });

  it('soft-deletes a topic through a tenant-scoped write', async () => {
    listeningTopic.findFirst.mockResolvedValue({
      id: 'topic-1',
      sources: [],
    });
    listeningTopic.update.mockResolvedValue({
      id: 'topic-1',
      isDeleted: true,
      sources: [],
    });

    await service.removeScoped('topic-1', {
      brandId: 'brand-1',
      organizationId: 'org-1',
    });

    expect(listeningTopic.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: false, isDeleted: true },
        where: {
          brandId: 'brand-1',
          id: 'topic-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(cacheInvalidationService.invalidate).toHaveBeenCalledWith(
      'listeningTopics:list:org-1',
      'listeningTopics:single:topic-1',
    );
  });

  it('maps a concurrent topic removal during delete to not found', async () => {
    listeningTopic.findFirst.mockResolvedValue({
      id: 'topic-1',
      sources: [],
    });
    listeningTopic.update.mockRejectedValue(
      Object.assign(new Error('Record not found'), { code: 'P2025' }),
    );

    await expect(
      service.removeScoped('topic-1', {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).rejects.toThrow('Listening topic not found');
    expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });

  it('excludes soft-deleted memberships from source-filtered topics', async () => {
    listeningTopic.findMany.mockResolvedValue([]);
    listeningTopic.count.mockResolvedValue(0);

    await service.findAllScoped(
      { brandId: 'brand-1', organizationId: 'org-1' },
      { source: 'source-1' } as never,
    );

    expect(listeningTopic.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sources: {
            some: {
              isDeleted: false,
              sourceId: 'source-1',
            },
          },
        }),
      }),
    );
  });

  it('lists evidence only after proving topic ownership', async () => {
    listeningTopic.findFirst.mockResolvedValue({
      id: 'topic-1',
      sources: [],
    });
    listeningEvidence.findMany.mockResolvedValue([{ id: 'evidence-1' }]);
    listeningEvidence.count.mockResolvedValue(1);

    const result = await service.listEvidence(
      'topic-1',
      { brandId: 'brand-1', organizationId: 'org-1' },
      {
        limit: 25,
        page: 1,
        pagination: true,
        source: 'source-1',
      } as never,
    );

    expect(listeningTopic.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId: 'brand-1',
          id: 'topic-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(listeningEvidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
          topicId: 'topic-1',
          topicSource: {
            isDeleted: false,
            sourceId: 'source-1',
          },
        }),
      }),
    );
    expect(result.total).toBe(1);
  });

  it('excludes evidence from soft-deleted source memberships by default', async () => {
    listeningTopic.findFirst.mockResolvedValue({
      id: 'topic-1',
      sources: [],
    });
    listeningEvidence.findMany.mockResolvedValue([]);
    listeningEvidence.count.mockResolvedValue(0);

    await service.listEvidence(
      'topic-1',
      { brandId: 'brand-1', organizationId: 'org-1' },
      {} as never,
    );

    expect(listeningEvidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          topicSource: {
            isDeleted: false,
          },
        }),
      }),
    );
  });
});

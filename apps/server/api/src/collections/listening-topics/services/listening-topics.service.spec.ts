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

  let service: ListeningTopicsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ListeningTopicsService({
      listeningEvidence,
      listeningTopic,
      socialSource,
    } as unknown as PrismaService);
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
          userId: 'user-1',
        }),
      }),
    );
    expect(topic.id).toBe('topic-1');
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
            create: [
              {
                brandId: 'brand-1',
                organizationId: 'org-1',
                platform: ListeningSourcePlatform.REDDIT,
                sourceId: 'source-3',
              },
            ],
            deleteMany: { sourceId: { in: ['source-2'] } },
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
      { limit: 25, page: 1, pagination: true } as never,
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
        }),
      }),
    );
    expect(result.total).toBe(1);
  });
});

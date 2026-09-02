vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ListeningTopicAttributionService } from '@api/collections/listening-topics/services/listening-topic-attribution.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetExecutionState } from '@genfeedai/contracts';

describe('ListeningTopicAttributionService', () => {
  const listeningTheme = { findFirst: vi.fn() };
  const post = { findMany: vi.fn() };
  const service = new ListeningTopicAttributionService({
    listeningTheme,
    post,
  } as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
    listeningTheme.findFirst.mockResolvedValue({ id: 'theme-1' });
  });

  it('projects canonical draft, scheduled, published, and measured outcomes', async () => {
    post.findMany.mockResolvedValue([
      makePost({ id: 'draft-1' }),
      makePost({
        groupId: 'release-1',
        id: 'scheduled-1',
        scheduledDate: new Date('2026-08-27T09:00:00.000Z'),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
      makePost({
        externalId: 'provider-publication-1',
        groupId: 'release-2',
        id: 'published-1',
        publishedAt: new Date('2026-08-27T10:00:00.000Z'),
        targetExecutionState: TargetExecutionState.PUBLISHED,
      }),
      makePost({
        externalId: 'provider-publication-2',
        groupId: 'release-3',
        id: 'measured-1',
        postAnalytics: [
          {
            createdAt: new Date('2026-08-27T11:00:00.000Z'),
            date: new Date('2026-08-27T00:00:00.000Z'),
            id: 'analytics-latest',
          },
        ],
        targetExecutionState: TargetExecutionState.PUBLISHED,
      }),
    ]);

    const result = await service.listOutcomesScoped('topic-1', 'theme-1', {
      brandId: 'brand-1',
      organizationId: 'org-1',
    });

    expect(listeningTheme.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        brandId: 'brand-1',
        id: 'theme-1',
        isDeleted: false,
        organizationId: 'org-1',
        topicId: 'topic-1',
      },
    });
    expect(post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId: 'brand-1',
          isDeleted: false,
          listeningThemeId: 'theme-1',
          listeningTopicId: 'topic-1',
          organizationId: 'org-1',
        },
      }),
    );
    expect(result.map(({ id, state }) => ({ id, state }))).toEqual([
      { id: 'draft-1', state: 'draft' },
      { id: 'scheduled-1', state: 'scheduled' },
      { id: 'published-1', state: 'published' },
      { id: 'measured-1', state: 'measured' },
    ]);
    expect(result[3]).toMatchObject({
      actionId: 'measured-1',
      latestPostAnalyticsId: 'analytics-latest',
      publicationId: 'provider-publication-2',
      releaseId: 'release-3',
      sourcePostId: 'source-post-1',
    });
    expect(result[3]).not.toHaveProperty('raw');
    expect(result[3]).not.toHaveProperty('metadata');
  });

  it('fails closed when the theme is foreign, missing, or soft-deleted', async () => {
    listeningTheme.findFirst.mockResolvedValue(null);

    await expect(
      service.listOutcomesScoped('topic-1', 'foreign-theme', {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).rejects.toThrow('Listening theme not found');

    expect(post.findMany).not.toHaveBeenCalled();
  });
});

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    brandId: 'brand-1',
    createdAt: new Date('2026-08-26T10:00:00.000Z'),
    externalId: null,
    groupId: null,
    id: 'post-1',
    listeningEvidenceIds: ['evidence-1'],
    listeningThemeId: 'theme-1',
    listeningTopicId: 'topic-1',
    organizationId: 'org-1',
    postAnalytics: [],
    publishedAt: null,
    scheduledDate: null,
    sourceActionId: 'source-post-1',
    targetExecutionState: TargetExecutionState.DRAFT,
    updatedAt: new Date('2026-08-26T10:00:00.000Z'),
    ...overrides,
  };
}

import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import type {
  SchedulerPostGroup,
  SchedulerPostTarget,
} from '@api/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { PostGroupReadinessService } from '@api/collections/post-groups/services/post-group-readiness.service';
import { seedReleaseListPage } from '@api/collections/post-groups/services/post-group-release-list.testing';
import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  PostEntityModel,
  PostStatus,
  PostVisibility,
  ReleaseAttachmentKind,
  ReleaseStatus,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import { BadRequestException } from '@nestjs/common';

/**
 * Setup signals are not what these tests exercise, so every provider reads as
 * fully configured on a publicly reachable origin — readiness then reflects
 * token state alone.
 */
function buildFullyConfiguredConfigService(): ConfigService {
  return {
    get: (key: string) =>
      key.endsWith('_URI') || key.endsWith('_URL')
        ? 'https://app.example.com/oauth/callback'
        : `${key}-value`,
  } as unknown as ConfigService;
}

describe('PostGroupPersistenceService', () => {
  let contractService: PostGroupContractService;
  let service: PostGroupPersistenceService;
  let prisma: {
    $queryRaw: ReturnType<typeof vi.fn>;
    brand: { findFirst: ReturnType<typeof vi.fn> };
    campaign: { findFirst: ReturnType<typeof vi.fn> };
    credential: { findMany: ReturnType<typeof vi.fn> };
    post: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    postGroup: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    contractService = new PostGroupContractService();
    prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
      campaign: { findFirst: vi.fn().mockResolvedValue({ id: 'campaign-1' }) },
      credential: { findMany: vi.fn().mockResolvedValue([]) },
      post: {
        create: vi.fn().mockResolvedValue(undefined),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      postGroup: {
        create: vi.fn().mockResolvedValue(makeGroup()),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
    };
    service = new PostGroupPersistenceService(
      prisma as unknown as PrismaService,
      contractService,
      new PostGroupReadinessService(
        new CredentialPublishingReadinessService(
          new PublishingProviderSetupService(
            buildFullyConfiguredConfigService(),
          ),
          // Quota is only read on the single-credential path, and readiness
          // rows arrive through the transaction client these tests pass in.
          { get: () => ({ getQuotaStatus: vi.fn() }) } as never,
          { credential: { findMany: vi.fn() } } as never,
        ),
      ),
    );
  });

  it('requires campaign membership to match the organization and brand', async () => {
    prisma.campaign.findFirst.mockResolvedValue(null);

    await expect(
      service.assertCampaignScope(
        prisma as never,
        'org-1',
        'campaign-1',
        'brand-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.campaign.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        brandId: 'brand-1',
        id: 'campaign-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('hydrates an idempotent release through organization-scoped rows', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(makeGroup());
    prisma.post.findMany.mockResolvedValue([makeTarget()]);

    await expect(
      service.findByIdempotencyKey('org-1', 'request-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'group-1',
        targets: [expect.objectContaining({ id: 'target-1' })],
      }),
    );
    expect(prisma.postGroup.findFirst).toHaveBeenCalledWith({
      where: {
        idempotencyKey: 'request-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: 'group-1',
          isDeleted: false,
          organizationId: 'org-1',
          parentId: null,
        }),
      }),
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('hydrates the latest exact-target analytics in one scoped batch query', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(makeGroup());
    prisma.post.findMany.mockResolvedValue([
      makeTarget(),
      makeTarget({
        brandId: 'brand-2',
        id: 'target-2',
        platform: CredentialPlatform.LINKEDIN,
      }),
    ]);
    prisma.$queryRaw.mockResolvedValue([
      {
        brandId: 'brand-1',
        date: new Date('2026-07-21T00:00:00.000Z'),
        engagementRate: 0.14,
        id: 'analytics-1',
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
        postId: 'target-1',
        totalComments: 8,
        totalLikes: 55,
        totalSaves: 3,
        totalShares: 5,
        totalViews: 1000,
        updatedAt: new Date('2026-07-21T12:30:00.000Z'),
      },
      {
        brandId: 'brand-1',
        date: new Date('2026-07-21T00:00:00.000Z'),
        engagementRate: 0.5,
        id: 'analytics-cross-scope',
        organizationId: 'org-1',
        platform: CredentialPlatform.LINKEDIN,
        postId: 'target-2',
        totalComments: 50,
        totalLikes: 50,
        totalSaves: 50,
        totalShares: 50,
        totalViews: 50,
        updatedAt: new Date('2026-07-21T13:00:00.000Z'),
      },
    ]);

    const release = await service.findByIdempotencyKey('org-1', 'request-1');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(release?.targets?.[0]?.analytics).toMatchObject({
      snapshot: { likes: 55, views: 1000 },
      state: 'ready',
    });
    expect(release?.targets?.[1]?.analytics).toEqual({
      collection: {
        capability: 'supported',
        error: null,
        freshness: 'unavailable',
        lastCollectedAt: null,
        requestedAt: null,
        state: 'unavailable',
      },
      snapshot: null,
      state: 'unavailable',
    });
  });

  it('degrades analytics to unavailable when the snapshot query fails', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(makeGroup());
    prisma.post.findMany.mockResolvedValue([makeTarget()]);
    prisma.$queryRaw.mockRejectedValue(new Error('analytics unavailable'));

    const release = await service.findByIdempotencyKey('org-1', 'request-1');

    expect(release?.targets?.[0]?.analytics).toEqual({
      collection: {
        capability: 'supported',
        error: null,
        freshness: 'unavailable',
        lastCollectedAt: null,
        requestedAt: null,
        state: 'unavailable',
      },
      snapshot: null,
      state: 'unavailable',
    });
  });

  it('enforces credential connection, platform, and brand scope', async () => {
    prisma.credential.findMany.mockResolvedValue([
      {
        brandId: 'brand-1',
        id: 'credential-1',
        isConnected: true,
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
      },
    ]);

    const credentials = await service.resolveCredentials(
      prisma as never,
      'org-1',
      [
        {
          credentialId: 'credential-1',
          platform: CredentialPlatform.TWITTER,
          visibility: PostVisibility.PUBLIC,
        },
      ],
    );
    await expect(
      service.resolveBrandId(prisma as never, 'org-1', 'brand-1', credentials),
    ).resolves.toBe('brand-1');

    prisma.credential.findMany.mockResolvedValueOnce([
      {
        brandId: 'brand-1',
        id: 'credential-1',
        isConnected: false,
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
      },
    ]);
    await expect(
      service.resolveCredentials(prisma as never, 'org-1', [
        {
          credentialId: 'credential-1',
          platform: CredentialPlatform.TWITTER,
          visibility: PostVisibility.PUBLIC,
        },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  function releaseListStatements(): { sql: string; values: unknown[] }[] {
    return prisma.$queryRaw.mock.calls
      .map(([statement]) => statement as { sql: string; values: unknown[] })
      .filter((statement) => statement.sql.includes('release_rows'));
  }

  it('lists one page of releases from a single SQL statement and hydrates only that page', async () => {
    seedReleaseListPage(
      prisma,
      [makeGroup({ id: 'group-target', scheduledAt: null })],
      [
        makeTarget({
          groupId: 'group-target',
          id: 'target-1',
          targetExecutionState: TargetExecutionState.FAILED,
        }),
      ],
      [{ id: 'group-target' }],
    );

    const result = await service.listReleaseGroups({
      brandId: 'brand-1',
      endDate: new Date('2026-07-27T00:00:00.000Z'),
      organizationId: 'org-1',
      startDate: new Date('2026-07-20T00:00:00.000Z'),
      statuses: [ReleaseStatus.SCHEDULED, ReleaseStatus.FAILED],
    });

    // Filtering, ranking and paging happen in the one statement; the service
    // no longer reads slim group or post rows for the whole history.
    expect(releaseListStatements()).toHaveLength(1);
    expect(prisma.postGroup.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.post.findMany).toHaveBeenCalledTimes(1);
    // Full rows (tags, settings, media) are hydrated for the page only.
    expect(prisma.postGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ id: true, status: true }),
        where: {
          id: { in: ['group-target'] },
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { groupId: 'asc' },
          { order: 'asc' },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        select: expect.objectContaining({
          id: true,
          scheduledDate: true,
          tags: expect.objectContaining({
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            where: { isDeleted: false },
          }),
        }),
        where: {
          credentialId: { not: null },
          groupId: { in: ['group-target'] },
          isDeleted: false,
          organizationId: 'org-1',
          parentId: null,
          platform: { not: null },
        },
      }),
    );
    expect(result).toMatchObject({
      docs: [
        expect.objectContaining({
          id: 'group-target',
          status: ReleaseStatus.FAILED,
          targetSummary: {
            [TargetExecutionState.FAILED]: 1,
            total: 1,
          },
          targets: [expect.objectContaining({ id: 'target-1' })],
        }),
      ],
      limit: 20,
      page: 1,
      totalDocs: 1,
      totalPages: 1,
    });
  });

  it('turns the requested page into a SQL limit and offset and reports the SQL total', async () => {
    const groups = ['c', 'b'].map((suffix) =>
      makeGroup({ id: `group-${suffix}` }),
    );
    seedReleaseListPage(
      prisma,
      groups,
      groups.map((group) =>
        makeTarget({ groupId: group.id, id: `target-${group.id}` }),
      ),
      [{ id: 'group-c' }, { id: 'group-b' }],
      5,
    );

    const result = await service.listReleaseGroups({
      limit: 2,
      organizationId: 'org-1',
      page: 2,
    });

    expect(releaseListStatements()[0]?.values.slice(-2)).toEqual([2, 2]);
    expect(result.docs.map((release) => release.id)).toEqual([
      'group-c',
      'group-b',
    ]);
    expect(result).toMatchObject({
      hasNextPage: true,
      hasPrevPage: true,
      limit: 2,
      nextPage: 3,
      page: 2,
      pagingCounter: 3,
      prevPage: 1,
      totalDocs: 5,
      totalPages: 3,
    });
    // Hydration is scoped to the two releases on the page, in SQL order.
    expect(prisma.postGroup.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['group-c', 'group-b'] },
        }),
      }),
    );
  });

  it('defaults an unpaged list to the first page instead of every release', async () => {
    seedReleaseListPage(prisma, [], [], []);

    await service.listReleaseGroups({ organizationId: 'org-1' });

    expect(releaseListStatements()[0]?.values.slice(-2)).toEqual([20, 0]);
  });

  it('reports no releases without a count when the first page is empty', async () => {
    seedReleaseListPage(prisma, [], [], []);

    await expect(
      service.listReleaseGroups({ organizationId: 'org-1' }),
    ).resolves.toMatchObject({ docs: [], totalDocs: 0, totalPages: 0 });
    expect(prisma.postGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.post.findMany).not.toHaveBeenCalled();
    expect(releaseListStatements()).toHaveLength(1);
  });

  it('counts separately when the requested page is past the last release', async () => {
    prisma.$queryRaw.mockImplementation(async (statement: { sql: string }) =>
      statement.sql.includes('LIMIT') ? [] : [{ totalDocs: 7n }],
    );

    const result = await service.listReleaseGroups({
      limit: 5,
      organizationId: 'org-1',
      page: 9,
    });

    expect(result).toMatchObject({
      docs: [],
      hasNextPage: false,
      hasPrevPage: true,
      page: 9,
      totalDocs: 7,
      totalPages: 2,
    });
    expect(releaseListStatements()).toHaveLength(2);
  });

  it('hydrates a group-less post by id as a one-target release', async () => {
    seedReleaseListPage(
      prisma,
      [],
      [
        {
          ...makeTarget({ groupId: null, id: 'legacy-post' }),
          description: '<p>Legacy body</p>',
          label: null,
          organizationId: 'org-1',
          userId: 'user-1',
        },
      ],
      [{ id: 'legacy-post', isSynthetic: true }],
    );

    const result = await service.listReleaseGroups({
      organizationId: 'org-1',
    });

    expect(result.docs).toEqual([
      expect.objectContaining({ id: 'legacy-post', title: 'Legacy body' }),
    ]);
    expect(prisma.postGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.post.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: null,
          id: { in: ['legacy-post'] },
        }),
      }),
    );
  });

  it('keeps the SQL ranking order when hydration returns rows in another order', async () => {
    seedReleaseListPage(
      prisma,
      [makeGroup({ id: 'group-a' }), makeGroup({ id: 'group-b' })],
      [
        makeTarget({ groupId: 'group-a', id: 'target-a' }),
        makeTarget({ groupId: 'group-b', id: 'target-b' }),
      ],
      [{ id: 'group-b' }, { id: 'group-a' }],
    );

    const result = await service.listReleaseGroups({
      organizationId: 'org-1',
    });

    expect(result.docs.map((release) => release.id)).toEqual([
      'group-b',
      'group-a',
    ]);
  });

  it('skips a ranked release that disappeared before hydration', async () => {
    seedReleaseListPage(
      prisma,
      [makeGroup({ id: 'group-a' })],
      [makeTarget({ groupId: 'group-a', id: 'target-a' })],
      [{ id: 'group-gone' }, { id: 'group-a' }],
    );

    const result = await service.listReleaseGroups({
      organizationId: 'org-1',
    });

    expect(result.docs.map((release) => release.id)).toEqual(['group-a']);
  });

  it('projects firstTagColor from the first target post tags', async () => {
    seedReleaseListPage(
      prisma,
      [makeGroup()],
      [
        makeTarget({
          tags: [
            {
              backgroundColor: '#ef4444',
              id: 'tag-launch',
              isDeleted: false,
              label: 'Launch',
              textColor: '#ffffff',
            },
          ],
        }),
      ],
      [{ id: 'group-1' }],
    );

    const result = await service.listReleaseGroups({ organizationId: 'org-1' });

    expect(result.docs[0]?.firstTagColor).toBe('#ef4444');
  });

  it.each([
    [
      { sourceArticleId: 'article-1' },
      { entityArticleId: 'article-1', entityModel: PostEntityModel.ARTICLE },
    ],
    [
      { sourceNewsletterId: 'newsletter-1' },
      {
        entityModel: PostEntityModel.NEWSLETTER,
        entityNewsletterId: 'newsletter-1',
      },
    ],
  ])(
    'links every target to its long-form source %o',
    async (provenance, expectedLink) => {
      prisma.credential.findMany.mockResolvedValue([
        {
          brandId: 'brand-1',
          id: 'credential-1',
          isConnected: true,
          organizationId: 'org-1',
          platform: CredentialPlatform.GHOST,
        },
      ]);
      prisma.post.create.mockResolvedValue(makeTarget());

      await service.createPostGroup(prisma as never, {
        input: {
          baseContent: '<p>Long-form body</p>',
          brandId: 'brand-1',
          targets: [
            {
              credentialId: 'credential-1',
              platform: CredentialPlatform.GHOST,
              visibility: PostVisibility.PUBLIC,
            },
          ],
          timezone: 'UTC',
          title: 'Long-form title',
        },
        organizationId: 'org-1',
        provenance: { source: 'long_form_delivery', ...provenance },
        scheduledAt: null,
        status: ReleaseStatus.DRAFT,
        userId: 'user-1',
      });

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ...expectedLink,
            label: 'Long-form title',
            source: 'long_form_delivery',
          }),
        }),
      );
    },
  );

  it('lists the hydrated releases linked to one newsletter, newest first', async () => {
    prisma.post.findMany
      .mockResolvedValueOnce([{ groupId: 'group-2' }, { groupId: 'group-1' }])
      .mockResolvedValue([]);
    prisma.postGroup.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(makeGroup({ id: where.id })),
    );

    const releases = await service.listSourceReleases(
      prisma as never,
      'org-1',
      {
        newsletterId: 'newsletter-1',
      },
    );

    expect(prisma.post.findMany).toHaveBeenNthCalledWith(1, {
      distinct: ['groupId'],
      orderBy: { createdAt: 'desc' },
      select: { groupId: true },
      take: 20,
      where: {
        entityNewsletterId: 'newsletter-1',
        groupId: { not: null },
        isDeleted: false,
        organizationId: 'org-1',
        parentId: null,
      },
    });
    expect(releases.map((release) => release.id)).toEqual([
      'group-2',
      'group-1',
    ]);
  });

  it('copies independent lifecycle and visibility onto attachment posts', async () => {
    await service.createAttachmentPosts(prisma as never, {
      brandId: 'brand-1',
      group: makeGroup(),
      input: {
        attachments: [
          { body: 'First comment', kind: ReleaseAttachmentKind.COMMENT },
        ],
        baseContent: 'Launch note',
        targets: [
          {
            credentialId: 'credential-1',
            platform: CredentialPlatform.TWITTER,
            visibility: PostVisibility.PUBLIC,
          },
        ],
        timezone: 'UTC',
        title: 'Launch',
      },
      parent: makeTarget({
        status: PostStatus.PUBLIC,
        targetExecutionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PRIVATE,
      }),
      target: {
        credentialId: 'credential-1',
        platform: CredentialPlatform.TWITTER,
        visibility: PostVisibility.PUBLIC,
      },
      userId: 'user-1',
    });

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetExecutionState: TargetExecutionState.PUBLISHED,
          visibility: PostVisibility.PRIVATE,
        }),
      }),
    );
    expect(prisma.post.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      'status',
    );
  });

  it('creates only platform-compatible thread and comment child posts', async () => {
    await service.createAttachmentPosts(prisma as never, {
      brandId: 'brand-1',
      group: makeGroup(),
      input: {
        attachments: [
          {
            body: 'Global comment',
            kind: ReleaseAttachmentKind.COMMENT,
          },
          {
            body: 'LinkedIn thread',
            kind: ReleaseAttachmentKind.THREAD,
            platform: CredentialPlatform.LINKEDIN,
          },
        ],
        baseContent: 'Launch note',
        targets: [
          {
            credentialId: 'credential-1',
            platform: CredentialPlatform.TWITTER,
            visibility: PostVisibility.PUBLIC,
          },
        ],
        timezone: 'UTC',
        title: 'Launch',
      },
      parent: makeTarget(),
      target: {
        attachments: [
          {
            body: 'Target thread',
            kind: ReleaseAttachmentKind.THREAD,
          },
        ],
        credentialId: 'credential-1',
        platform: CredentialPlatform.TWITTER,
        visibility: PostVisibility.PUBLIC,
      },
      userId: 'user-1',
    });

    expect(prisma.post.create).toHaveBeenCalledTimes(2);
    expect(prisma.post.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          description: 'Global comment',
          parentId: 'target-1',
        }),
      }),
    );
    expect(prisma.post.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          description: 'Target thread',
          parentId: 'target-1',
        }),
      }),
    );
  });
});

function makeGroup(
  overrides: Partial<SchedulerPostGroup> = {},
): SchedulerPostGroup {
  return {
    attachments: [],
    baseContent: 'Launch note',
    brandId: 'brand-1',
    campaignId: null,
    createdAt: new Date('2026-07-19T10:00:00.000Z'),
    id: 'group-1',
    idempotencyKey: 'request-1',
    isDeleted: false,
    media: [],
    organizationId: 'org-1',
    ownerId: 'user-1',
    postingSetId: null,
    publishedAt: null,
    rssFeedItemId: null,
    rssSourceId: null,
    recurrence: null,
    scheduledAt: new Date('2026-07-20T10:00:00.000Z'),
    status: ReleaseStatus.SCHEDULED,
    statusTransitions: [],
    timezone: 'UTC',
    title: 'Launch',
    updatedAt: new Date('2026-07-19T10:00:00.000Z'),
    ...overrides,
  };
}

function makeTarget(
  overrides: Partial<SchedulerPostTarget> = {},
): SchedulerPostTarget {
  return {
    agentContextSource: null,
    agentContextVersion: null,
    agentStrategyId: null,
    agentThreadId: null,
    analyticsCollectedAt: null,
    analyticsCollectionAttemptKey: null,
    analyticsCollectionError: null,
    analyticsCollectionRequestedAt: null,
    analyticsCollectionState: 'unavailable',
    brandId: 'brand-1',
    campaignId: null,
    createdAt: new Date('2026-07-19T10:00:00.000Z'),
    credentialId: 'credential-1',
    externalId: null,
    externalShortcode: null,
    groupId: 'group-1',
    id: 'target-1',
    isDeleted: false,
    lastAttemptAt: null,
    order: 0,
    platform: CredentialPlatform.TWITTER,
    publishedAt: null,
    publishApprovalId: null,
    retryCount: 0,
    scheduledDate: new Date('2026-07-20T10:00:00.000Z'),
    status: PostStatus.SCHEDULED,
    targetAttachments: [],
    targetError: null,
    targetExecutionState: TargetExecutionState.SCHEDULED,
    targetIdempotencyKey: null,
    targetReadiness: null,
    targetSettings: {},
    targetValidationIssues: [],
    targetValidationState: TargetValidationState.VALID,
    timezone: 'UTC',
    updatedAt: new Date('2026-07-19T10:00:00.000Z'),
    url: null,
    visibility: PostVisibility.PUBLIC,
    workflowExecutionId: null,
    ...overrides,
  };
}

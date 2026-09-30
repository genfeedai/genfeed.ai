import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import type {
  SchedulerPostGroup,
  SchedulerPostTarget,
} from '@api/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { PostGroupReadinessService } from '@api/collections/post-groups/services/post-group-readiness.service';
import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  PostStatus,
  PostVisibility,
  ReleaseAttachmentKind,
  ReleaseStatus,
  ReleaseTargetSource,
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

  it('lists active organization releases that intersect the window and bounds both reads to it', async () => {
    const targetGroup = makeGroup({
      id: 'group-target',
      scheduledAt: null,
    });
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-target',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.FAILED,
      }),
    ]);
    prisma.postGroup.findMany.mockResolvedValue([targetGroup]);

    const window = {
      gte: new Date('2026-07-20T00:00:00.000Z'),
      lte: new Date('2026-07-27T00:00:00.000Z'),
    };
    const result = await service.listReleaseGroups({
      brandId: 'brand-1',
      endDate: new Date('2026-07-27T00:00:00.000Z'),
      organizationId: 'org-1',
      startDate: new Date('2026-07-20T00:00:00.000Z'),
      statuses: [ReleaseStatus.SCHEDULED, ReleaseStatus.FAILED],
    });

    // Window prefilter: id-only reads bounded by the schedule window.
    expect(prisma.postGroup.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        scheduledAt: window,
      },
    });
    expect(prisma.post.findMany).toHaveBeenCalledWith({
      select: { groupId: true },
      where: {
        brandId: 'brand-1',
        credentialId: { not: null },
        groupId: { not: null },
        isDeleted: false,
        organizationId: 'org-1',
        parentId: null,
        platform: { not: null },
        scheduledDate: window,
      },
    });
    // Hydration reads only touch releases that intersect the window.
    expect(prisma.postGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: 'asc' },
        select: expect.objectContaining({ id: true, status: true }),
        where: {
          brandId: 'brand-1',
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
          brandId: 'brand-1',
          credentialId: { not: null },
          isDeleted: false,
          OR: [
            { groupId: { in: ['group-target'] } },
            { groupId: null, scheduledDate: window },
          ],
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
      limit: 1,
      page: 1,
      totalDocs: 1,
      totalPages: 1,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('sorts releases by earliest effective schedule and uses the id as a stable tie-breaker', async () => {
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-target',
        id: 'target-early',
        scheduledDate: new Date('2026-07-20T09:00:00.000Z'),
      }),
      makeTarget({
        groupId: 'group-a',
        id: 'target-a',
        scheduledDate: new Date('2026-07-20T10:00:00.000Z'),
      }),
      makeTarget({
        groupId: 'group-b',
        id: 'target-b',
        scheduledDate: new Date('2026-07-20T10:00:00.000Z'),
      }),
    ]);
    prisma.postGroup.findMany.mockResolvedValue([
      makeGroup({
        id: 'group-b',
        scheduledAt: new Date('2026-07-20T10:00:00.000Z'),
      }),
      makeGroup({
        id: 'group-target',
        scheduledAt: new Date('2026-07-20T12:00:00.000Z'),
      }),
      makeGroup({
        id: 'group-a',
        scheduledAt: new Date('2026-07-20T10:00:00.000Z'),
      }),
    ]);

    const result = await service.listReleaseGroups({
      endDate: new Date('2026-07-27T00:00:00.000Z'),
      organizationId: 'org-1',
      startDate: new Date('2026-07-20T00:00:00.000Z'),
    });

    expect(result.docs.map((release) => release.id)).toEqual([
      'group-target',
      'group-a',
      'group-b',
    ]);
  });

  it('filters calendar reads by derived target status instead of persisted group status', async () => {
    prisma.postGroup.findMany.mockResolvedValue([
      makeGroup({ status: ReleaseStatus.SCHEDULED }),
    ]);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({ targetExecutionState: TargetExecutionState.FAILED }),
    ]);

    await expect(
      service.listReleaseGroups({
        endDate: new Date('2026-07-27T00:00:00.000Z'),
        organizationId: 'org-1',
        startDate: new Date('2026-07-20T00:00:00.000Z'),
        statuses: [ReleaseStatus.SCHEDULED],
      }),
    ).resolves.toMatchObject({ docs: [], totalDocs: 0 });

    expect(prisma.postGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ status: expect.anything() }),
      }),
    );
  });

  it('narrows the calendar to releases owning a target that matches the platform, credential, and execution-state filters', async () => {
    prisma.postGroup.findMany.mockResolvedValue([
      makeGroup({ id: 'group-target' }),
    ]);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-target',
        platform: CredentialPlatform.INSTAGRAM,
        targetExecutionState: TargetExecutionState.FAILED,
      }),
    ]);

    const result = await service.listReleaseGroups({
      brandId: 'brand-1',
      credentialIds: ['credential-1'],
      endDate: new Date('2026-07-27T00:00:00.000Z'),
      executionStates: [TargetExecutionState.FAILED],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.INSTAGRAM],
      startDate: new Date('2026-07-20T00:00:00.000Z'),
    });

    expect(result.docs).toEqual([
      expect.objectContaining({ id: 'group-target' }),
    ]);
  });

  it('narrows the calendar to releases belonging to one Publish content campaign', async () => {
    prisma.postGroup.findMany.mockResolvedValue([
      makeGroup({ campaignId: 'cmp_spring', id: 'group-campaign' }),
      makeGroup({ id: 'group-unassigned' }),
    ]);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({ groupId: 'group-campaign', id: 'campaign-target' }),
      makeTarget({ groupId: 'group-unassigned', id: 'unassigned-target' }),
    ]);

    const result = await service.listReleaseGroups({
      campaignId: 'cmp_spring',
      endDate: new Date('2026-07-27T00:00:00.000Z'),
      organizationId: 'org-1',
      startDate: new Date('2026-07-20T00:00:00.000Z'),
    });

    expect(result.docs.map((release) => release.id)).toEqual([
      'group-campaign',
    ]);
  });

  it('filters the canonical projection by derived manual and workflow provenance', async () => {
    prisma.postGroup.findMany.mockResolvedValue([
      makeGroup({ id: 'group-agent' }),
      makeGroup({ id: 'group-manual' }),
      makeGroup({ id: 'group-workflow' }),
    ]);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        agentThreadId: 'thread-1',
        groupId: 'group-agent',
        id: 'agent',
      }),
      makeTarget({ groupId: 'group-manual', id: 'manual' }),
      makeTarget({
        groupId: 'group-workflow',
        id: 'workflow',
        workflowExecutionId: 'execution-1',
      }),
    ]);

    const result = await service.listReleaseGroups({
      endDate: new Date('2026-07-27T00:00:00.000Z'),
      organizationId: 'org-1',
      sources: [ReleaseTargetSource.MANUAL, ReleaseTargetSource.WORKFLOW],
      startDate: new Date('2026-07-20T00:00:00.000Z'),
    });

    expect(result.docs.map((release) => release.id)).toEqual([
      'group-manual',
      'group-workflow',
    ]);
  });

  it('excludes workflow-executed targets from the agent source filter', async () => {
    prisma.postGroup.findMany.mockResolvedValue([
      makeGroup({ id: 'group-target' }),
    ]);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-target',
        workflowExecutionId: 'execution-1',
      }),
    ]);

    const result = await service.listReleaseGroups({
      endDate: new Date('2026-07-27T00:00:00.000Z'),
      organizationId: 'org-1',
      sources: [ReleaseTargetSource.AGENT],
      startDate: new Date('2026-07-20T00:00:00.000Z'),
    });

    expect(result).toMatchObject({ docs: [], totalDocs: 0 });
  });

  it('returns an empty page when no target matches the filters', async () => {
    prisma.postGroup.findMany.mockResolvedValue([
      makeGroup({ id: 'group-target' }),
    ]);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({ groupId: 'group-target' }),
    ]);

    await expect(
      service.listReleaseGroups({
        endDate: new Date('2026-07-27T00:00:00.000Z'),
        organizationId: 'org-1',
        platforms: [CredentialPlatform.TIKTOK],
        startDate: new Date('2026-07-20T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ docs: [], totalDocs: 0 });
  });

  it('returns all projected releases when no target filter is requested', async () => {
    prisma.postGroup.findMany.mockResolvedValue([makeGroup()]);
    prisma.post.findMany.mockResolvedValue([makeTarget()]);

    const result = await service.listReleaseGroups({
      endDate: new Date('2026-07-27T00:00:00.000Z'),
      organizationId: 'org-1',
      startDate: new Date('2026-07-20T00:00:00.000Z'),
      statuses: [ReleaseStatus.SCHEDULED],
    });

    expect(result.docs).toEqual([expect.objectContaining({ id: 'group-1' })]);
    // One id-only window prefilter plus one hydration read per table.
    expect(prisma.postGroup.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.post.findMany).toHaveBeenCalledTimes(2);
  });

  it('projects firstTagColor from the first target post tags', async () => {
    prisma.postGroup.findMany.mockResolvedValue([makeGroup()]);
    prisma.post.findMany.mockResolvedValue([
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
    ]);

    const result = await service.listReleaseGroups({ organizationId: 'org-1' });

    expect(result.docs[0]?.firstTagColor).toBe('#ef4444');
  });

  it('skips the window prefilter and reads each table once for unwindowed lists', async () => {
    prisma.postGroup.findMany.mockResolvedValue([makeGroup()]);
    prisma.post.findMany.mockResolvedValue([makeTarget()]);

    const result = await service.listReleaseGroups({ organizationId: 'org-1' });

    expect(result.docs).toEqual([expect.objectContaining({ id: 'group-1' })]);
    expect(prisma.postGroup.findMany).toHaveBeenCalledOnce();
    expect(prisma.post.findMany).toHaveBeenCalledOnce();
    expect(prisma.postGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDeleted: false, organizationId: 'org-1' },
      }),
    );
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          credentialId: { not: null },
          isDeleted: false,
          organizationId: 'org-1',
          parentId: null,
          platform: { not: null },
        },
      }),
    );
  });

  it('ignores legacy posts without a channel identity', async () => {
    prisma.post.findMany.mockResolvedValue([
      {
        ...makeTarget({ groupId: null, id: 'legacy-post' }),
        platform: null,
      },
    ]);

    await expect(
      service.listReleaseGroups({ organizationId: 'org-1' }),
    ).resolves.toMatchObject({ docs: [], totalDocs: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
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

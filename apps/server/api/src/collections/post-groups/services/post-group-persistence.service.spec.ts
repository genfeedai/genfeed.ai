import type {
  SchedulerPostGroup,
  SchedulerPostTarget,
} from '@api/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  ReleaseAttachmentKind,
  ReleaseStatus,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';

describe('PostGroupPersistenceService', () => {
  let contractService: PostGroupContractService;
  let service: PostGroupPersistenceService;
  let prisma: {
    brand: { findFirst: ReturnType<typeof vi.fn> };
    credential: { findMany: ReturnType<typeof vi.fn> };
    post: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
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
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
      credential: { findMany: vi.fn().mockResolvedValue([]) },
      post: {
        create: vi.fn().mockResolvedValue(undefined),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue([]),
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
    );
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
        },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('lists active organization releases that intersect the window and hydrates targets in one query', async () => {
    const targetGroup = makeGroup({
      id: 'group-target',
      scheduledAt: null,
    });
    prisma.post.groupBy.mockResolvedValue([{ groupId: 'group-target' }]);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-target',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.FAILED,
      }),
    ]);
    prisma.postGroup.findMany.mockResolvedValue([targetGroup]);

    const result = await service.listReleaseGroups({
      brandId: 'brand-1',
      endDate: new Date('2026-07-27T00:00:00.000Z'),
      organizationId: 'org-1',
      startDate: new Date('2026-07-20T00:00:00.000Z'),
      statuses: [ReleaseStatus.SCHEDULED, ReleaseStatus.FAILED],
    });

    expect(prisma.post.groupBy).toHaveBeenCalledWith({
      by: ['groupId'],
      where: {
        brandId: 'brand-1',
        groupId: { not: null },
        isDeleted: false,
        organizationId: 'org-1',
        parentId: null,
        scheduledDate: {
          gte: new Date('2026-07-20T00:00:00.000Z'),
          lte: new Date('2026-07-27T00:00:00.000Z'),
        },
      },
    });
    expect(prisma.postGroup.findMany).toHaveBeenCalledWith({
      orderBy: { id: 'asc' },
      where: {
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        OR: [
          {
            scheduledAt: {
              gte: new Date('2026-07-20T00:00:00.000Z'),
              lte: new Date('2026-07-27T00:00:00.000Z'),
            },
          },
          { id: { in: ['group-target'] } },
        ],
        status: {
          in: [ReleaseStatus.SCHEDULED, ReleaseStatus.FAILED],
        },
      },
    });
    expect(prisma.post.findMany).toHaveBeenCalledWith({
      orderBy: [
        { groupId: 'asc' },
        { order: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      where: {
        groupId: { in: ['group-target'] },
        isDeleted: false,
        organizationId: 'org-1',
        parentId: null,
      },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 'group-target',
        targetSummary: {
          [TargetExecutionState.FAILED]: 1,
          total: 1,
        },
        targets: [expect.objectContaining({ id: 'target-1' })],
      }),
    ]);
  });

  it('sorts releases by earliest effective schedule and uses the id as a stable tie-breaker', async () => {
    prisma.post.groupBy.mockResolvedValue([]);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-target',
        id: 'target-early',
        scheduledDate: new Date('2026-07-20T09:00:00.000Z'),
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

    expect(result.map((release) => release.id)).toEqual([
      'group-target',
      'group-a',
      'group-b',
    ]);
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
    createdAt: new Date('2026-07-19T10:00:00.000Z'),
    id: 'group-1',
    idempotencyKey: 'request-1',
    isDeleted: false,
    media: [],
    organizationId: 'org-1',
    ownerId: 'user-1',
    publishedAt: null,
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
    agentRunId: null,
    agentStrategyId: null,
    agentThreadId: null,
    brandId: 'brand-1',
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
    workflowExecutionId: null,
    ...overrides,
  };
}

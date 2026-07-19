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
    };
    postGroup: {
      findFirst: ReturnType<typeof vi.fn>;
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
      },
      postGroup: {
        findFirst: vi.fn(),
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

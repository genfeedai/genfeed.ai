import { createHash } from 'node:crypto';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import {
  CredentialPlatform,
  PublishApprovalPolicyId,
  PublishApprovalStatus,
} from '@genfeedai/enums';
import type { AgentArtifactReferenceService } from '@genfeedai/server';

const NOW = new Date('2026-07-13T22:00:00.000Z');

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function scopeDigest(): string {
  const value = {
    actorUserId: 'user-1',
    artifactVersionPinId: 'pin-1',
    brandId: 'brand-1',
    contextVersion: 4,
    destinations: [
      {
        credentialId: 'credential-1',
        platform: CredentialPlatform.TWITTER,
      },
    ],
    organizationId: 'org-1',
    policy: {
      id: PublishApprovalPolicyId.VERSION_BOUND_V1,
      version: 1,
    },
    postId: 'post-1',
    scheduleIntent: {
      kind: 'scheduled',
      scheduledAt: '2026-07-14T10:00:00.000Z',
      timezone: 'UTC',
    },
  };
  return `sha256:v1:${createHash('sha256')
    .update(stableStringify(value))
    .digest('hex')}`;
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    agentContextVersion: 4,
    brandId: 'brand-1',
    credentialId: 'credential-1',
    id: 'post-1',
    isDeleted: false,
    organizationId: 'org-1',
    platform: CredentialPlatform.TWITTER,
    publishApprovalId: null,
    scheduledDate: new Date('2026-07-14T10:00:00.000Z'),
    status: 'scheduled',
    targetExecutionState: 'scheduled',
    timezone: 'UTC',
    ...overrides,
  };
}

function makeApproval(overrides: Record<string, unknown> = {}) {
  return {
    actorUserId: 'user-1',
    artifactVersionPinId: 'pin-1',
    brandId: 'brand-1',
    contextVersion: 4,
    createdAt: NOW,
    destinations: [
      {
        credentialId: 'credential-1',
        platform: CredentialPlatform.TWITTER,
      },
    ],
    executedAt: null,
    id: 'approval-1',
    invalidatedAt: null,
    invalidationReason: null,
    lastError: null,
    operationId: 'operation-1',
    organizationId: 'org-1',
    policy: {
      id: PublishApprovalPolicyId.VERSION_BOUND_V1,
      version: 1,
    },
    postId: 'post-1',
    provenance: { source: 'typed-publish-approval' },
    scheduleIntent: {
      kind: 'scheduled',
      scheduledAt: '2026-07-14T10:00:00.000Z',
      timezone: 'UTC',
    },
    scopeDigest: 'scope-digest',
    status: PublishApprovalStatus.QUEUED,
    statusTransitions: [
      {
        at: NOW.toISOString(),
        from: PublishApprovalStatus.APPROVED,
        to: PublishApprovalStatus.QUEUED,
      },
    ],
    updatedAt: NOW,
    ...overrides,
  };
}

describe('PublishApprovalsService', () => {
  it('binds a typed approval to the canonical version, scope, actor, target, schedule, and policy', async () => {
    const post = makePost();
    const publishApproval = {
      create: vi.fn().mockImplementation(({ data }) => ({
        ...data,
        createdAt: NOW,
        executedAt: null,
        invalidatedAt: null,
        invalidationReason: null,
        lastError: null,
        updatedAt: NOW,
      })),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) =>
        callback({ post: prisma.post, publishApproval }),
      ),
      post: {
        findFirst: vi.fn().mockResolvedValue(post),
        update: vi.fn().mockResolvedValue(post),
      },
      publishApproval,
    };
    const artifactReferenceService = {
      createOrReuseVersionPin: vi.fn().mockResolvedValue({ id: 'pin-1' }),
    };
    const logger = { log: vi.fn() };
    const transaction = { post: prisma.post, publishApproval };
    const service = new PublishApprovalsService(
      prisma as never,
      artifactReferenceService as unknown as AgentArtifactReferenceService,
      logger as never,
    );

    const approval = await service.createForCurrentPost({
      actorUserId: 'user-1',
      mode: 'scheduled',
      organizationId: 'org-1',
      postId: 'post-1',
      provenance: { surface: 'review-queue' },
      transaction: transaction as never,
    });

    expect(approval).toEqual(
      expect.objectContaining({
        actorUserId: 'user-1',
        artifactVersionPinId: 'pin-1',
        brandId: 'brand-1',
        contextVersion: 4,
        destinations: [
          {
            credentialId: 'credential-1',
            platform: CredentialPlatform.TWITTER,
          },
        ],
        organizationId: 'org-1',
        policy: {
          id: PublishApprovalPolicyId.VERSION_BOUND_V1,
          version: 1,
        },
        postId: 'post-1',
        scheduleIntent: {
          kind: 'scheduled',
          scheduledAt: '2026-07-14T10:00:00.000Z',
          timezone: 'UTC',
        },
        status: PublishApprovalStatus.APPROVED,
      }),
    );
    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishApprovalId: approval.id,
          reviewVersionPinId: 'pin-1',
        }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(
      artifactReferenceService.createOrReuseVersionPin,
    ).toHaveBeenCalledWith(expect.objectContaining({ transaction }));
    expect(logger.log).toHaveBeenCalledWith('conversation_shell_approval', {
      action: 'approve',
      integrity: 'matched',
      organizationId: 'org-1',
      outcome: 'success',
      telemetryQueryVersion: 1,
    });
  });

  it('reuses the exact scheduled approval scope without creating duplicate approval or operation identities', async () => {
    const post = makePost({ publishApprovalId: 'approval-1' });
    const existing = makeApproval({
      scopeDigest: scopeDigest(),
      status: PublishApprovalStatus.APPROVED,
    });
    const publishApproval = {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(existing),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    };
    const prisma = {
      post: {
        findFirst: vi.fn().mockResolvedValue(post),
        update: vi.fn().mockResolvedValue(post),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      publishApproval,
    };
    const artifactReferenceService = {
      createOrReuseVersionPin: vi.fn().mockResolvedValue({ id: 'pin-1' }),
    };
    const service = new PublishApprovalsService(
      prisma as never,
      artifactReferenceService as unknown as AgentArtifactReferenceService,
    );
    const transaction = { post: prisma.post, publishApproval };

    const first = await service.createForCurrentPost({
      actorUserId: 'user-1',
      contextVersion: 4,
      mode: 'scheduled',
      organizationId: 'org-1',
      postId: 'post-1',
      transaction: transaction as never,
    });
    const replay = await service.createForCurrentPost({
      actorUserId: 'user-1',
      contextVersion: 4,
      mode: 'scheduled',
      organizationId: 'org-1',
      postId: 'post-1',
      transaction: transaction as never,
    });

    expect(first.id).toBe('approval-1');
    expect(replay.id).toBe(first.id);
    expect(replay.operationId).toBe(first.operationId);
    expect(publishApproval.create).not.toHaveBeenCalled();
    expect(publishApproval.update).not.toHaveBeenCalled();
    expect(prisma.post.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.post.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          publishApprovalId: 'approval-1',
          reviewDecision: 'APPROVED',
          reviewVersionPinId: 'pin-1',
        },
        where: expect.objectContaining({
          id: 'post-1',
          organizationId: 'org-1',
          publishApprovals: {
            some: expect.objectContaining({ id: 'approval-1' }),
          },
        }),
      }),
    );
  });

  it('fails an idempotent replay when approval eligibility changes before attach', async () => {
    const existing = makeApproval({
      scopeDigest: scopeDigest(),
      status: PublishApprovalStatus.APPROVED,
    });
    const publishApproval = {
      findFirst: vi.fn().mockResolvedValue(existing),
    };
    const post = {
      findFirst: vi.fn().mockResolvedValue(makePost()),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const service = new PublishApprovalsService(
      { post, publishApproval } as never,
      {
        createOrReuseVersionPin: vi.fn().mockResolvedValue({ id: 'pin-1' }),
      } as unknown as AgentArtifactReferenceService,
    );

    await expect(
      service.createForCurrentPost({
        actorUserId: 'user-1',
        contextVersion: 4,
        mode: 'scheduled',
        organizationId: 'org-1',
        postId: 'post-1',
        transaction: { post, publishApproval } as never,
      }),
    ).rejects.toThrow('no longer eligible for activation');

    expect(post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publishApprovals: {
            some: expect.objectContaining({
              id: 'approval-1',
              status: {
                in: expect.arrayContaining([
                  PublishApprovalStatus.APPROVED,
                  PublishApprovalStatus.PUBLISHED,
                ]),
              },
            }),
          },
        }),
      }),
    );
  });

  it('fails closed and invalidates when the canonical brand drifts', async () => {
    const approval = makeApproval();
    const publishApproval = {
      findFirst: vi.fn().mockResolvedValue(approval),
      findMany: vi.fn().mockResolvedValue([approval]),
      update: vi.fn().mockResolvedValue(approval),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) =>
        callback({
          post: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          publishApproval,
        }),
      ),
      member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
      organization: {
        findFirst: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      },
      post: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            makePost({ brandId: 'brand-2', publishApprovalId: 'approval-1' }),
          ),
      },
      publishApproval,
    };
    const service = new PublishApprovalsService(
      prisma as never,
      {
        assertVersionPinCurrent: vi.fn(),
      } as unknown as AgentArtifactReferenceService,
    );

    await expect(
      service.claimForExecution({
        approvalId: 'approval-1',
        operationId: 'operation-1',
        organizationId: 'org-1',
        postId: 'post-1',
        versionPinId: 'pin-1',
      }),
    ).rejects.toThrow('scope no longer matches');

    expect(publishApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PublishApprovalStatus.INVALIDATED,
        }),
      }),
    );
    expect(publishApproval.updateMany).not.toHaveBeenCalled();
  });

  it('treats a repeated published operation as complete without another execution claim', async () => {
    const approval = makeApproval({ status: PublishApprovalStatus.PUBLISHED });
    const prisma = {
      publishApproval: {
        findFirst: vi.fn().mockResolvedValue(approval),
        updateMany: vi.fn(),
      },
    };
    const artifactReferenceService = {
      assertVersionPinCurrent: vi.fn(),
    };
    const service = new PublishApprovalsService(
      prisma as never,
      artifactReferenceService as unknown as AgentArtifactReferenceService,
    );

    const claim = await service.claimForExecution({
      approvalId: 'approval-1',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'post-1',
      versionPinId: 'pin-1',
    });

    expect(claim.isAlreadyPublished).toBe(true);
    expect(claim.executionStartedAt).toBeNull();
    expect(prisma.publishApproval.updateMany).not.toHaveBeenCalled();
    expect(
      artifactReferenceService.assertVersionPinCurrent,
    ).not.toHaveBeenCalled();
  });

  it.each([
    [true, PublishApprovalStatus.PUBLISHED, 'success'],
    [false, PublishApprovalStatus.FAILED, 'failure'],
  ] as const)('records provider completion telemetry for success=%s', async (isSuccess, completedStatus, outcome) => {
    const executionStartedAt = new Date();
    const executing = makeApproval({
      status: PublishApprovalStatus.EXECUTING,
      updatedAt: executionStartedAt,
    });
    const completed = makeApproval({ status: completedStatus });
    const publishApproval = {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(executing)
        .mockResolvedValueOnce(completed),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const logger = { log: vi.fn() };
    const service = new PublishApprovalsService(
      { publishApproval } as never,
      {} as AgentArtifactReferenceService,
      logger as never,
    );

    await service.completeExecution({
      approvalId: 'approval-1',
      ...(!isSuccess ? { error: 'provider failed' } : {}),
      executionStartedAt: executionStartedAt.toISOString(),
      isSuccessful: isSuccess,
      operationId: 'operation-1',
      organizationId: 'org-1',
      versionPinId: 'pin-1',
    });

    expect(publishApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: completedStatus }),
      }),
    );
    expect(logger.log).toHaveBeenCalledWith('conversation_shell_approval', {
      action: 'execute',
      integrity: 'matched',
      organizationId: 'org-1',
      outcome,
      telemetryQueryVersion: 1,
    });
  });

  it('allows only one queued execution claimant', async () => {
    const approval = makeApproval({ scopeDigest: scopeDigest() });
    const publishApproval = {
      findFirst: vi.fn().mockResolvedValue(approval),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const service = new PublishApprovalsService(
      {
        credential: {
          findFirst: vi.fn().mockResolvedValue({ id: 'credential-1' }),
        },
        member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
        organization: {
          findFirst: vi.fn().mockResolvedValue({ userId: 'user-1' }),
        },
        post: {
          findFirst: vi
            .fn()
            .mockResolvedValue(makePost({ publishApprovalId: 'approval-1' })),
        },
        publishApproval,
      } as never,
      {
        assertVersionPinCurrent: vi.fn(),
      } as unknown as AgentArtifactReferenceService,
    );

    await expect(
      service.claimForExecution({
        approvalId: 'approval-1',
        operationId: 'operation-1',
        organizationId: 'org-1',
        postId: 'post-1',
        versionPinId: 'pin-1',
      }),
    ).rejects.toThrow('already executing');

    expect(publishApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: PublishApprovalStatus.QUEUED,
          updatedAt: NOW,
        }),
      }),
    );
  });

  it('resets an expired execution lease before claiming a retry', async () => {
    const expiredAt = new Date('2026-07-13T20:00:00.000Z');
    const executing = makeApproval({
      scopeDigest: scopeDigest(),
      status: PublishApprovalStatus.EXECUTING,
      updatedAt: expiredAt,
    });
    const queued = makeApproval({
      lastError: 'Expired publish execution lease was reset for retry.',
      scopeDigest: scopeDigest(),
      status: PublishApprovalStatus.QUEUED,
      updatedAt: NOW,
    });
    const reclaimed = makeApproval({
      scopeDigest: scopeDigest(),
      status: PublishApprovalStatus.EXECUTING,
      updatedAt: new Date('2026-07-18T15:00:00.000Z'),
    });
    const publishApproval = {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(executing)
        .mockResolvedValueOnce(queued)
        .mockResolvedValueOnce(reclaimed),
      updateMany: vi
        .fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 }),
    };
    const service = new PublishApprovalsService(
      {
        credential: {
          findFirst: vi.fn().mockResolvedValue({ id: 'credential-1' }),
        },
        member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
        organization: {
          findFirst: vi.fn().mockResolvedValue({ userId: 'user-1' }),
        },
        post: {
          findFirst: vi
            .fn()
            .mockResolvedValue(makePost({ publishApprovalId: 'approval-1' })),
        },
        publishApproval,
      } as never,
      {
        assertVersionPinCurrent: vi.fn(),
      } as unknown as AgentArtifactReferenceService,
    );

    const claim = await service.claimForExecution({
      approvalId: 'approval-1',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'post-1',
      versionPinId: 'pin-1',
    });

    expect(claim.isAlreadyPublished).toBe(false);
    expect(claim.executionStartedAt).toBe(reclaimed.updatedAt.toISOString());
    expect(publishApproval.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: 'Expired publish execution lease was reset for retry.',
          status: PublishApprovalStatus.QUEUED,
        }),
        where: expect.objectContaining({
          status: PublishApprovalStatus.EXECUTING,
          updatedAt: expiredAt,
        }),
      }),
    );
    expect(publishApproval.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: PublishApprovalStatus.EXECUTING,
        }),
        where: expect.objectContaining({
          status: PublishApprovalStatus.QUEUED,
          updatedAt: NOW,
        }),
      }),
    );
  });

  it('releases post mutability after an execution lease expires', async () => {
    const expired = makeApproval({
      status: PublishApprovalStatus.EXECUTING,
      updatedAt: new Date('2026-07-13T20:00:00.000Z'),
    });
    const publishApproval = {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(expired)
        .mockResolvedValueOnce(
          makeApproval({ status: PublishApprovalStatus.QUEUED }),
        ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const service = new PublishApprovalsService(
      { publishApproval } as never,
      {} as AgentArtifactReferenceService,
    );

    await expect(
      service.assertPostMutable('org-1', 'post-1'),
    ).resolves.toBeUndefined();

    expect(publishApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PublishApprovalStatus.QUEUED,
        }),
        where: expect.objectContaining({
          status: PublishApprovalStatus.EXECUTING,
          updatedAt: expired.updatedAt,
        }),
      }),
    );
  });

  it('rejects completion from a stale execution lease', async () => {
    const publishApproval = {
      findFirst: vi.fn().mockResolvedValue(
        makeApproval({
          status: PublishApprovalStatus.EXECUTING,
          updatedAt: NOW,
        }),
      ),
      updateMany: vi.fn(),
    };
    const service = new PublishApprovalsService(
      { publishApproval } as never,
      {} as AgentArtifactReferenceService,
    );

    await expect(
      service.completeExecution({
        approvalId: 'approval-1',
        executionStartedAt: '2026-07-13T21:59:00.000Z',
        isSuccessful: true,
        operationId: 'operation-1',
        organizationId: 'org-1',
        versionPinId: 'pin-1',
      }),
    ).rejects.toThrow('lease is stale or has been reclaimed');

    expect(publishApproval.updateMany).not.toHaveBeenCalled();
  });

  it('rejects completion after the execution lease expires', async () => {
    const expiredAt = new Date(Date.now() - 16 * 60 * 1000);
    const executing = makeApproval({
      status: PublishApprovalStatus.EXECUTING,
      updatedAt: expiredAt,
    });
    const publishApproval = {
      findFirst: vi.fn().mockResolvedValue(executing),
      updateMany: vi.fn(),
    };
    const service = new PublishApprovalsService(
      { publishApproval } as never,
      {} as AgentArtifactReferenceService,
    );

    await expect(
      service.completeExecution({
        approvalId: 'approval-1',
        executionStartedAt: expiredAt.toISOString(),
        isSuccessful: true,
        operationId: 'operation-1',
        organizationId: 'org-1',
        versionPinId: 'pin-1',
      }),
    ).rejects.toThrow('lease has expired');

    expect(publishApproval.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a status transition that loses its optimistic-lock race', async () => {
    const publishApproval = {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          makeApproval({ status: PublishApprovalStatus.APPROVED }),
        ),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const service = new PublishApprovalsService(
      { publishApproval } as never,
      {} as AgentArtifactReferenceService,
    );

    await expect(service.markQueued('approval-1', 'org-1')).rejects.toThrow(
      `changed concurrently; expected status ${PublishApprovalStatus.APPROVED}`,
    );

    expect(publishApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'approval-1',
          organizationId: 'org-1',
          status: PublishApprovalStatus.APPROVED,
        },
      }),
    );
  });

  it('clears every post approval marker when invalidating queued approval state', async () => {
    const approval = makeApproval();
    const post = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const publishApproval = {
      findMany: vi.fn().mockResolvedValue([approval]),
      update: vi.fn().mockResolvedValue(approval),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) =>
        callback({ post, publishApproval }),
      ),
      publishApproval,
    };
    const service = new PublishApprovalsService(
      prisma as never,
      {} as AgentArtifactReferenceService,
    );

    await service.invalidatePost(
      'org-1',
      'post-1',
      'Canonical publish scope changed.',
      'user-1',
    );

    expect(post.updateMany).toHaveBeenCalledWith({
      data: {
        publishApprovalId: null,
        reviewDecision: null,
        reviewVersionPinId: null,
      },
      where: { id: 'post-1', organizationId: 'org-1' },
    });
  });

  it('blocks version drift before claiming execution', async () => {
    const approval = makeApproval({ scopeDigest: scopeDigest() });
    const publishApproval = {
      findFirst: vi.fn().mockResolvedValue(approval),
      findMany: vi.fn().mockResolvedValue([approval]),
      update: vi.fn().mockResolvedValue(approval),
      updateMany: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) =>
        callback({
          post: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          publishApproval,
        }),
      ),
      credential: {
        findFirst: vi.fn().mockResolvedValue({ id: 'credential-1' }),
      },
      member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
      organization: {
        findFirst: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      },
      post: {
        findFirst: vi
          .fn()
          .mockResolvedValue(makePost({ publishApprovalId: 'approval-1' })),
      },
      publishApproval,
    };
    const artifactReferenceService = {
      assertVersionPinCurrent: vi
        .fn()
        .mockRejectedValue(new Error('Approved content version is stale')),
    };
    const service = new PublishApprovalsService(
      prisma as never,
      artifactReferenceService as unknown as AgentArtifactReferenceService,
    );

    await expect(
      service.claimForExecution({
        approvalId: 'approval-1',
        operationId: 'operation-1',
        organizationId: 'org-1',
        postId: 'post-1',
        versionPinId: 'pin-1',
      }),
    ).rejects.toThrow('Approved content version is stale');

    expect(prisma.publishApproval.updateMany).not.toHaveBeenCalled();
    expect(prisma.publishApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PublishApprovalStatus.INVALIDATED,
        }),
      }),
    );
  });

  it('blocks a disconnected or cross-scope destination before execution', async () => {
    const approval = makeApproval({ scopeDigest: scopeDigest() });
    const publishApproval = {
      findFirst: vi.fn().mockResolvedValue(approval),
      findMany: vi.fn().mockResolvedValue([approval]),
      update: vi.fn().mockResolvedValue(approval),
      updateMany: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) =>
        callback({
          post: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          publishApproval,
        }),
      ),
      credential: { findFirst: vi.fn().mockResolvedValue(null) },
      member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
      organization: {
        findFirst: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      },
      post: {
        findFirst: vi
          .fn()
          .mockResolvedValue(makePost({ publishApprovalId: 'approval-1' })),
      },
      publishApproval,
    };
    const artifactReferenceService = { assertVersionPinCurrent: vi.fn() };
    const service = new PublishApprovalsService(
      prisma as never,
      artifactReferenceService as unknown as AgentArtifactReferenceService,
    );

    await expect(
      service.claimForExecution({
        approvalId: 'approval-1',
        operationId: 'operation-1',
        organizationId: 'org-1',
        postId: 'post-1',
        versionPinId: 'pin-1',
      }),
    ).rejects.toThrow('destination is no longer authorized');

    expect(
      artifactReferenceService.assertVersionPinCurrent,
    ).not.toHaveBeenCalled();
    expect(publishApproval.updateMany).not.toHaveBeenCalled();
  });
});

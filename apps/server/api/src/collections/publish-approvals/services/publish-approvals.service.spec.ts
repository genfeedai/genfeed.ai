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
    const service = new PublishApprovalsService(
      prisma as never,
      artifactReferenceService as unknown as AgentArtifactReferenceService,
    );

    const approval = await service.createForCurrentPost({
      actorUserId: 'user-1',
      mode: 'scheduled',
      organizationId: 'org-1',
      postId: 'post-1',
      provenance: { surface: 'review-queue' },
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

    expect(claim.alreadyPublished).toBe(true);
    expect(prisma.publishApproval.updateMany).not.toHaveBeenCalled();
    expect(
      artifactReferenceService.assertVersionPinCurrent,
    ).not.toHaveBeenCalled();
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

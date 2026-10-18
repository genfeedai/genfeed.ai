import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import {
  type AgentArtifactReferenceService,
  runWithActionOrigin,
} from '@api/index';
import {
  BrandedPublishHoldException,
  type BrandedPublishHoldService,
} from '@api/services/branded-text-generation/branded-publish-hold.service';
import {
  ActionOrigin,
  CredentialPlatform,
  PublishApprovalPolicyId,
  PublishApprovalStatus,
} from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-07-13T22:00:00.000Z');

function makePost() {
  return {
    agentContextVersion: 4,
    brandId: 'brand-1',
    credentialId: 'credential-1',
    id: 'post-1',
    ingredients: [],
    isDeleted: false,
    organizationId: 'org-1',
    platform: CredentialPlatform.TWITTER,
    publishApprovalId: null,
    scheduledDate: new Date('2026-07-14T10:00:00.000Z'),
    status: 'scheduled',
    targetExecutionState: 'scheduled',
    timezone: 'UTC',
  };
}

function makeApproval(origin: string) {
  return {
    actorUserId: 'user-1',
    artifactVersionPinId: 'pin-1',
    brandId: 'brand-1',
    contextVersion: 4,
    createdAt: NOW,
    destinations: [
      { credentialId: 'credential-1', platform: CredentialPlatform.TWITTER },
    ],
    executedAt: null,
    id: 'approval-1',
    invalidatedAt: null,
    invalidationReason: null,
    lastError: null,
    operationId: 'operation-1',
    organizationId: 'org-1',
    policy: { id: PublishApprovalPolicyId.VERSION_BOUND_V1, version: 1 },
    postId: 'post-1',
    provenance: { origin, source: 'typed-publish-approval' },
    scheduleIntent: {
      kind: 'scheduled',
      scheduledAt: '2026-07-14T10:00:00.000Z',
      timezone: 'UTC',
    },
    scopeDigest: 'scope-digest',
    status: PublishApprovalStatus.QUEUED,
    statusTransitions: [],
    updatedAt: NOW,
  };
}

function makeHold(veto?: BrandedPublishHoldException) {
  return {
    assertPostPublishable: vi.fn(async () => {
      if (veto) throw veto;
    }),
  };
}

const veto = () =>
  new BrandedPublishHoldException({
    brandId: 'brand-1',
    reason: 'provisional_brand',
    receiptId: 'receipt-1',
  });

function createService(hold: ReturnType<typeof makeHold>) {
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
  };
  const post = {
    findFirst: vi.fn().mockResolvedValue(makePost()),
    update: vi.fn().mockResolvedValue(makePost()),
  };
  const prisma = {
    $transaction: vi.fn(async (callback) =>
      callback({ post, publishApproval }),
    ),
    post,
    publishApproval,
  };
  const service = new PublishApprovalsService(
    prisma as never,
    {
      createOrReuseVersionPin: vi.fn().mockResolvedValue({ id: 'pin-1' }),
    } as unknown as AgentArtifactReferenceService,
    { log: vi.fn() } as never,
    undefined,
    hold as unknown as BrandedPublishHoldService,
  );
  return { publishApproval, service };
}

const approve = (service: PublishApprovalsService) =>
  service.createForCurrentPost({
    actorUserId: 'user-1',
    mode: 'scheduled',
    organizationId: 'org-1',
    postId: 'post-1',
    provenance: { surface: 'test' },
  });

describe('PublishApprovalsService branded publish hold', () => {
  it.each([
    [ActionOrigin.UI, true, false],
    [ActionOrigin.WORKFLOW, false, true],
    [ActionOrigin.AGENT, false, false],
    [ActionOrigin.MCP, false, true],
    [ActionOrigin.API, false, false],
    [ActionOrigin.UNKNOWN, false, false],
  ])(
    'asks the hold about a %s approval (human: %s, Policy bound: %s)',
    async (origin, isHuman, isPolicyBound) => {
      const hold = makeHold();
      const { service } = createService(hold);

      await runWithActionOrigin({ origin }, () => approve(service));

      expect(hold.assertPostPublishable).toHaveBeenCalledWith(
        expect.objectContaining({
          isHumanApproval: isHuman,
          isPolicyBound,
          organizationId: 'org-1',
          postId: 'post-1',
        }),
      );
    },
  );

  it('mints no approval for a workflow post the brand Policy holds (#7339)', async () => {
    const { publishApproval, service } = createService(
      makeHold(
        new BrandedPublishHoldException({
          brandId: 'brand-1',
          reason: 'policy_violation',
          violations: [
            {
              detail: 'Video is always reviewed.',
              rule: 'video_always_reviewed',
            },
          ],
        }),
      ),
    );

    const error = await runWithActionOrigin(
      { origin: ActionOrigin.WORKFLOW },
      () => approve(service),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BrandedPublishHoldException);
    expect((error as BrandedPublishHoldException).getResponse()).toMatchObject({
      code: 'brand_policy_held',
      violations: [expect.objectContaining({ rule: 'video_always_reviewed' })],
    });
    expect(publishApproval.create).not.toHaveBeenCalled();
  });

  it('mints no approval for a held post', async () => {
    const { publishApproval, service } = createService(makeHold(veto()));

    await expect(
      runWithActionOrigin({ origin: ActionOrigin.WORKFLOW }, () =>
        approve(service),
      ),
    ).rejects.toBeInstanceOf(BrandedPublishHoldException);
    expect(publishApproval.create).not.toHaveBeenCalled();
  });

  it('mints approvals as before when no hold is wired', async () => {
    const { service } = createService(makeHold());
    const bare = new PublishApprovalsService(
      (service as unknown as { prisma: never }).prisma,
      {
        createOrReuseVersionPin: vi.fn().mockResolvedValue({ id: 'pin-1' }),
      } as unknown as AgentArtifactReferenceService,
      { log: vi.fn() } as never,
    );

    await expect(approve(bare)).resolves.toMatchObject({ postId: 'post-1' });
  });

  describe('claiming for execution', () => {
    function claimFixture(origin: string, hold: ReturnType<typeof makeHold>) {
      const publishApproval = {
        findFirst: vi.fn().mockResolvedValue(makeApproval(origin)),
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
          post: { findFirst: vi.fn().mockResolvedValue(makePost()) },
          publishApproval,
        } as never,
        {
          assertVersionPinCurrent: vi.fn(),
        } as unknown as AgentArtifactReferenceService,
        undefined,
        undefined,
        hold as unknown as BrandedPublishHoldService,
      );
      return { publishApproval, service };
    }
    const claim = (service: PublishApprovalsService) =>
      service.claimForExecution({
        approvalId: 'approval-1',
        operationId: 'operation-1',
        organizationId: 'org-1',
        postId: 'post-1',
        versionPinId: 'pin-1',
      });

    it.each([
      ['ui', true, false],
      ['workflow', false, true],
      ['mcp', false, true],
      ['unknown', false, false],
    ])(
      'reads the recorded %s origin as human: %s, Policy bound: %s',
      async (origin, isHuman, isPolicyBound) => {
        const hold = makeHold();
        const { service } = claimFixture(origin, hold);

        await claim(service).catch(() => undefined);

        expect(hold.assertPostPublishable).toHaveBeenCalledWith({
          isHumanApproval: isHuman,
          isPolicyBound,
          organizationId: 'org-1',
          postId: 'post-1',
        });
      },
    );

    it('never claims the lease for a held post', async () => {
      const { publishApproval, service } = claimFixture(
        'workflow',
        makeHold(veto()),
      );

      await expect(claim(service)).rejects.toBeInstanceOf(
        BrandedPublishHoldException,
      );
      expect(publishApproval.updateMany).not.toHaveBeenCalled();
    });
  });
});

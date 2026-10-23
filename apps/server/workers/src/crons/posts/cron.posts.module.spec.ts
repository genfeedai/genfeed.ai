// The module graph reaches `@workers/queues/queues.module`, whose ConfigModule
// instantiates the real ConfigService at import time. Seed the validated env
// before any import runs so the Joi schema passes.
vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'test');
  process.env.PORT = process.env.PORT ?? '3013';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/genfeed';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
});

import {
  AgentArtifactReferenceService,
  PublishApprovalsService,
  runWithActionOrigin,
} from '@api/index';
import { digestPublishApprovalValue } from '@api/publish-approvals/publish-approval-integrity';
import { BrandPublishPolicyService } from '@api/services/brand-publish-policy/brand-publish-policy.service';
import { MediaAssessmentService } from '@api/services/media-assessment/media-assessment.service';
import { MediaReadinessService } from '@api/services/media-readiness/media-readiness.service';
import {
  ActionOrigin,
  CredentialPlatform,
  PublishApprovalPolicyId,
  PublishApprovalStatus,
} from '@genfeedai/contracts';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import type { FactoryProvider } from '@nestjs/common';
import { CronPostsModule } from '@workers/crons/posts/cron.posts.module';

describe('CronPostsModule', () => {
  it('should be defined', () => {
    expect(CronPostsModule).toBeDefined();
  });
});

describe('CronPostsModule publish approvals provider', () => {
  const now = new Date('2026-07-13T22:00:00.000Z');
  const post = {
    agentContextVersion: 4,
    brandId: 'brand-1',
    credentialId: 'credential-1',
    id: 'post-1',
    ingredients: [{ id: 'asset-1' }],
    isDeleted: false,
    organizationId: 'org-1',
    platform: CredentialPlatform.TWITTER,
    publishApprovalId: 'approval-1',
    scheduledDate: new Date('2026-07-14T10:00:00.000Z'),
    status: 'scheduled',
    targetExecutionState: 'scheduled',
    timezone: 'UTC',
  };
  const claim = {
    approvalId: 'approval-1',
    operationId: 'operation-1',
    organizationId: 'org-1',
    postId: 'post-1',
    versionPinId: 'pin-1',
  };

  // Builds PublishApprovalsService exactly as the worker module does: the
  // factory and its injected tokens come from the module's own metadata, and
  // every token resolves to the real class over faked persistence.
  function buildWorkerApprovals(
    harness: Record<string, unknown>,
    provenanceOrigin: ActionOrigin = ActionOrigin.WORKFLOW,
  ) {
    let approval = {
      actorUserId: 'user-1',
      artifactVersionPinId: 'pin-1',
      brandId: 'brand-1',
      contextVersion: 4,
      createdAt: now,
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
      provenance: { origin: provenanceOrigin },
      scheduleIntent: {
        kind: 'scheduled',
        scheduledAt: '2026-07-14T10:00:00.000Z',
        timezone: 'UTC',
      },
      scopeDigest: digestPublishApprovalValue({
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
        policy: { id: PublishApprovalPolicyId.VERSION_BOUND_V1, version: 1 },
        postId: 'post-1',
        scheduleIntent: {
          kind: 'scheduled',
          scheduledAt: '2026-07-14T10:00:00.000Z',
          timezone: 'UTC',
        },
      }),
      status: PublishApprovalStatus.QUEUED,
      statusTransitions: [],
      updatedAt: now,
    };
    const publishApproval = {
      create: vi.fn(),
      findFirst: vi.fn().mockImplementation(async () => approval),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockImplementation(async ({ data }) => {
        approval = { ...approval, ...data };
        return { count: 1 };
      }),
    };
    const prisma = {
      brandedGenerationReceipt: { findMany: vi.fn().mockResolvedValue([]) },
      credential: {
        findFirst: vi.fn().mockResolvedValue({ id: 'credential-1' }),
      },
      ingredient: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { category: 'IMAGE', generationHarness: harness, id: 'asset-1' },
          ]),
      },
      mediaModeration: { findMany: vi.fn().mockResolvedValue([]) },
      mediaPerception: { findMany: vi.fn().mockResolvedValue([]) },
      mediaTextDecision: { findMany: vi.fn().mockResolvedValue([]) },
      member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
      organization: {
        findFirst: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      },
      post: {
        findFirst: vi.fn().mockResolvedValue(post),
        update: vi.fn().mockResolvedValue(post),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      publishApproval,
    };
    const readiness = {
      evaluatePublishReadiness: vi.fn().mockResolvedValue({
        checkedAt: now.toISOString(),
        diagnostics: [],
        isBlocked: false,
      }),
    };
    const assessment = new MediaAssessmentService(
      prisma as never,
      readiness as never,
      {} as never,
      {} as never,
      {
        getFeatureSettingsState: vi.fn().mockResolvedValue({
          isResolved: true,
          settings: {
            ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
            mediaGateVisionMode: 'off',
            mediaTextGateDecisionMode: 'off',
            moderationMode: 'off',
          },
        }),
      } as never,
    );
    const artifacts = {
      assertVersionPinCurrent: vi.fn(),
      createOrReuseVersionPin: vi.fn().mockResolvedValue({ id: 'pin-1' }),
    };
    const tokens = new Map<unknown, unknown>([
      [PrismaService, prisma],
      [LoggerService, undefined],
      [MediaAssessmentService, assessment],
      // The readiness-only gate the worker used to inject: no assessPublishMedia.
      [MediaReadinessService, readiness],
      [AgentArtifactReferenceService, artifacts],
      // No brand Policy facts for the post, so only the media gate can hold it.
      [
        BrandPublishPolicyService,
        { describePost: vi.fn().mockResolvedValue(null) },
      ],
    ]);
    const providers = Reflect.getMetadata('providers', CronPostsModule) as
      | FactoryProvider[]
      | undefined;
    const provider = providers?.find(
      (candidate) =>
        typeof candidate === 'object' &&
        'provide' in candidate &&
        candidate.provide === PublishApprovalsService,
    ) as FactoryProvider<PublishApprovalsService>;
    const args = (provider.inject ?? []).map((token) => {
      if (!tokens.has(token)) {
        throw new Error(`Unresolved worker token: ${String(token)}`);
      }
      return tokens.get(token);
    });
    return {
      prisma,
      service: provider.useFactory(...args) as PublishApprovalsService,
    };
  }

  it('injects the media assessment gate into the worker approvals service', () => {
    const { service } = buildWorkerApprovals({});
    expect(
      (service as unknown as { mediaReadinessGate: object }).mediaReadinessGate,
    ).toBeInstanceOf(MediaAssessmentService);
  });

  it.each([ActionOrigin.WORKFLOW, ActionOrigin.AGENT])(
    'rejects enhancement-failed media from %s before insert and before EXECUTING',
    async (origin) => {
      const { prisma, service } = buildWorkerApprovals({
        isEnhancementFailed: true,
        status: 'skipped',
      });
      await expect(
        runWithActionOrigin({ origin }, () =>
          service.createForCurrentPost({
            actorUserId: 'user-1',
            mode: 'scheduled',
            organizationId: 'org-1',
            postId: 'post-1',
          }),
        ),
      ).rejects.toThrow('Brand enhancement failed');
      expect(prisma.publishApproval.create).not.toHaveBeenCalled();

      await expect(service.claimForExecution(claim)).rejects.toThrow(
        'Brand enhancement failed',
      );
      expect(prisma.publishApproval.updateMany).not.toHaveBeenCalled();
    },
  );

  it('still claims successfully enhanced media', async () => {
    const { service } = buildWorkerApprovals({ status: 'applied' });
    await expect(service.claimForExecution(claim)).resolves.toMatchObject({
      isAlreadyPublished: false,
    });
  });

  it('lets a claim of an explicitly UI-approved approval through flagged media', async () => {
    const { service } = buildWorkerApprovals(
      { isEnhancementFailed: true, status: 'skipped' },
      ActionOrigin.UI,
    );
    await expect(service.claimForExecution(claim)).resolves.toMatchObject({
      isAlreadyPublished: false,
    });
  });
});

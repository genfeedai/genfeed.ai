import type { PostAccountTarget } from '@api/collections/posts/services/post-account-fanout.service';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowTrendPublishExecutorRegistrarService } from '@api/collections/workflows/services/workflow-trend-publish-executor-registrar.service';
import { BrandPublishPolicyService } from '@api/services/brand-publish-policy/brand-publish-policy.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  Platform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { createDefaultBrandPublishPolicy } from '@genfeedai/contracts/api-types/contracts/brand-publish-policy.contract';
import type { IBrandPublishPolicy } from '@genfeedai/contracts/interfaces';
import {
  createExecutableActionNode,
  type INodeExecutor,
  type NodeExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

function createHelper(): WorkflowEngineExecutorHelperService {
  return {
    buildPostLabel: (description: string) => description.slice(0, 60),
    extractPublishIngredientIds: () => [],
    wrapEngineExecutor:
      (executor: INodeExecutor) =>
      async (...args: Parameters<NodeExecutor>) =>
        (
          await executor.execute({
            context: args[2],
            inputs: args[1],
            node: args[0],
          })
        ).data,
  } as unknown as WorkflowEngineExecutorHelperService;
}

function runPublishNode(
  postsService: { create: ReturnType<typeof vi.fn> },
  fanoutService: { resolveTargets: ReturnType<typeof vi.fn> },
  options: {
    prisma?: unknown;
    schedule?: Record<string, unknown>;
  } = {},
) {
  const engine = new WorkflowEngine();

  new WorkflowTrendPublishExecutorRegistrarService(
    createHelper(),
    { get: vi.fn() } as unknown as ConfigService,
    {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService,
    undefined,
    undefined,
    undefined,
    undefined,
    options.prisma as never,
    undefined,
    postsService as never,
    fanoutService as never,
    undefined,
    options.prisma
      ? new BrandPublishPolicyService(options.prisma as PrismaService)
      : undefined,
  ).register(engine);

  return engine.getExecutor('genfeedAction')?.(
    createExecutableActionNode({
      actionId: 'publish',
      id: 'publish',
      label: 'Publish',
      parameters: {
        caption: 'Launch post',
        platforms: ['twitter'],
        schedule: options.schedule ?? { type: 'immediate' },
      },
    }),
    new Map([['brand', 'brand-1']]),
    {
      organizationId: 'org-1',
      runId: 'run-1',
      userId: 'user-1',
      workflowId: 'wf-1',
      workflowVersionId: 'version-1',
    },
  );
}

describe('WorkflowTrendPublishExecutorRegistrarService', () => {
  it('persists a domain platform for the resolved account', async () => {
    const postsService = {
      create: vi.fn().mockResolvedValue({ id: 'post-1' }),
    };
    const targets: PostAccountTarget[] = [
      {
        caption: 'Launch post',
        credentialId: 'cred-1',
        platform: Platform.TWITTER,
      },
    ];
    const fanoutService = {
      resolveTargets: vi.fn().mockResolvedValue(targets),
    };

    await runPublishNode(postsService, fanoutService);

    expect(fanoutService.resolveTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        caption: 'Launch post',
        organizationId: 'org-1',
        platforms: ['twitter'],
      }),
    );
    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-1',
        platform: CredentialPlatform.TWITTER,
      }),
    );
    expect(postsService.create.mock.calls[0]?.[0].platform).toBe('twitter');
  });

  it('creates one post per connected account under a single group', async () => {
    const postsService = {
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: 'post-1' })
        .mockResolvedValueOnce({ id: 'post-2' }),
    };
    // Two X accounts on one brand: the node publishes to both, and each gets
    // its own body so the platform does not suppress the siblings as dupes.
    const targets: PostAccountTarget[] = [
      {
        caption: 'Launch post',
        credentialId: 'cred-1',
        platform: Platform.TWITTER,
      },
      {
        caption: 'Launch post, rephrased',
        credentialId: 'cred-2',
        platform: Platform.TWITTER,
      },
    ];
    const fanoutService = {
      resolveTargets: vi.fn().mockResolvedValue(targets),
    };

    const result = (await runPublishNode(postsService, fanoutService)) as {
      platforms: string[];
      postIds: string[];
    };

    expect(result.postIds).toEqual(['post-1', 'post-2']);
    // One platform, two accounts — the platform list stays deduped.
    expect(result.platforms).toEqual(['twitter']);
    expect(postsService.create).toHaveBeenCalledTimes(2);

    const first = postsService.create.mock.calls[0]?.[0];
    const second = postsService.create.mock.calls[1]?.[0];

    expect(first.credentialId).toBe('cred-1');
    expect(first.description).toBe('Launch post');
    expect(second.credentialId).toBe('cred-2');
    expect(second.description).toBe('Launch post, rephrased');
    expect(first.groupId).toEqual(expect.any(String));
    expect(second.groupId).toBe(first.groupId);
  });

  it('creates nothing when the brand has no connected account', async () => {
    const postsService = { create: vi.fn() };
    const fanoutService = { resolveTargets: vi.fn().mockResolvedValue([]) };

    const result = (await runPublishNode(postsService, fanoutService)) as {
      postIds: string[];
    };

    expect(postsService.create).not.toHaveBeenCalled();
    expect(result.postIds).toEqual([]);
  });
});

describe('WorkflowTrendPublishExecutorRegistrarService publish hold', () => {
  const SCHEDULED = {
    datetime: '2026-10-20T10:00:00.000Z',
    type: 'scheduled',
  };
  const targets: PostAccountTarget[] = [
    {
      caption: 'Launch post',
      credentialId: 'cred-1',
      platform: Platform.TWITTER,
    },
  ];

  function fixture(
    receipts: { id: string; mode: string; state: string }[],
    hasApprovedKit = false,
    policy: IBrandPublishPolicy = createDefaultBrandPublishPolicy(),
  ) {
    const prisma = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      brand: { findFirst: vi.fn().mockResolvedValue({ agentConfig: {} }) },
      brandOsRevision: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            hasApprovedKit ? { content: { policy }, id: 'rev-1' } : null,
          ),
      },
      brandedGenerationReceipt: {
        findMany: vi.fn().mockResolvedValue(receipts),
      },
      ingredient: { findMany: vi.fn().mockResolvedValue([]) },
      post: { count: vi.fn().mockResolvedValue(0) },
      profile: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const postsService = {
      create: vi.fn().mockResolvedValue({ id: 'post-1' }),
    };
    const fanoutService = {
      resolveTargets: vi.fn().mockResolvedValue(targets),
    };
    return { fanoutService, postsService, prisma };
  }

  it('saves a draft instead of scheduling text a provisional receipt left uncleared', async () => {
    const { fanoutService, postsService, prisma } = fixture([
      { id: 'receipt-1', mode: 'provisional_brand', state: 'needs_review' },
    ]);

    const result = (await runPublishNode(postsService, fanoutService, {
      prisma,
      schedule: SCHEDULED,
    })) as Record<string, unknown>;

    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Launch post',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    expect(
      postsService.create.mock.calls[0]?.[0].scheduledDate,
    ).toBeUndefined();
    expect(result).toMatchObject({
      holdReason: 'provisional_brand',
      postIds: ['post-1'],
      scheduledFor: null,
      status: 'held',
    });
    expect(prisma.brandedGenerationReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('schedules the same text once the brand has an approved kit', async () => {
    const { fanoutService, postsService, prisma } = fixture(
      [{ id: 'receipt-1', mode: 'provisional_brand', state: 'needs_review' }],
      true,
    );

    const result = (await runPublishNode(postsService, fanoutService, {
      prisma,
      schedule: SCHEDULED,
    })) as Record<string, unknown>;

    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    );
    expect(result.status).toBe('scheduled');
  });

  it('schedules text no receipt ever produced under an approved Policy', async () => {
    const { fanoutService, postsService, prisma } = fixture([], true);

    const result = (await runPublishNode(postsService, fanoutService, {
      prisma,
      schedule: SCHEDULED,
    })) as Record<string, unknown>;

    expect(result.status).toBe('scheduled');
    expect(result).not.toHaveProperty('holdReason');
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('saves a draft and records why while the brand has no approved Policy (#7339)', async () => {
    const { fanoutService, postsService, prisma } = fixture([]);

    const result = (await runPublishNode(postsService, fanoutService, {
      prisma,
      schedule: SCHEDULED,
    })) as Record<string, unknown>;

    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    expect(result).toMatchObject({
      holdReason: 'policy_violation',
      scheduledFor: null,
      status: 'held',
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('holds text that breaks the approved Policy', async () => {
    const { fanoutService, postsService, prisma } = fixture([], true, {
      ...createDefaultBrandPublishPolicy(),
      bannedPhrases: ['launch'],
    });

    const result = (await runPublishNode(postsService, fanoutService, {
      prisma,
      schedule: SCHEDULED,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      holdReason: 'policy_violation',
      status: 'held',
    });
    const recorded = prisma.$executeRaw.mock.calls[0]?.slice(1) ?? [];
    expect(String(recorded[0])).toContain('banned_phrase');
  });

  it('does not look at receipts when nothing is scheduled', async () => {
    const { fanoutService, postsService, prisma } = fixture([
      { id: 'receipt-1', mode: 'provisional_brand', state: 'needs_review' },
    ]);

    const result = (await runPublishNode(postsService, fanoutService, {
      prisma,
    })) as Record<string, unknown>;

    expect(prisma.brandedGenerationReceipt.findMany).not.toHaveBeenCalled();
    expect(result.status).toBe('queued');
  });
});

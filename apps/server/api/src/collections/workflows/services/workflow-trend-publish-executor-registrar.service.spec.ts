import type { PostAccountTarget } from '@api/collections/posts/services/post-account-fanout.service';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowTrendPublishExecutorRegistrarService } from '@api/collections/workflows/services/workflow-trend-publish-executor-registrar.service';
import { CredentialPlatform, Platform } from '@genfeedai/enums';
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
    undefined,
    undefined,
    postsService as never,
    fanoutService as never,
  ).register(engine);

  return engine.getExecutor('genfeedAction')?.(
    createExecutableActionNode({
      actionId: 'publish',
      id: 'publish',
      label: 'Publish',
      parameters: {
        caption: 'Launch post',
        platforms: ['twitter'],
        schedule: { type: 'immediate' },
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

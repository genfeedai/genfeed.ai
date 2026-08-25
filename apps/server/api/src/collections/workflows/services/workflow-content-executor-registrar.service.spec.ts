import type { PostAccountTarget } from '@api/collections/posts/services/post-account-fanout.service';
import { WorkflowContentExecutorRegistrarService } from '@api/collections/workflows/services/workflow-content-executor-registrar.service';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { CredentialPlatform, Platform } from '@genfeedai/enums';
import {
  type INodeExecutor,
  type NodeExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

function createHelper(): WorkflowEngineExecutorHelperService {
  return {
    buildPostLabel: (description: string) => description.slice(0, 60),
    getOptionalNumberConfig: (
      _config: Record<string, unknown>,
      _key: string,
      fallback: number,
    ) => fallback,
    readConfigString: (
      config: Record<string, unknown> | undefined,
      key: string,
    ) => {
      const value = config?.[key];
      return typeof value === 'string' ? value : undefined;
    },
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

function createOpenRouterService() {
  return {
    chatCompletion: vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Draft body' } }],
    }),
  };
}

function runPostGenNode(
  config: Record<string, unknown>,
  services: {
    credentialsService: { findOne: ReturnType<typeof vi.fn> };
    fanoutService: { resolveTargets: ReturnType<typeof vi.fn> };
    postsService: { create: ReturnType<typeof vi.fn> };
  },
) {
  const engine = new WorkflowEngine();

  new WorkflowContentExecutorRegistrarService(
    createHelper(),
    services.postsService as never,
    services.credentialsService as never,
    undefined,
    createOpenRouterService() as never,
    undefined,
    services.fanoutService as never,
  ).register(engine);

  return engine.getExecutor('postGen')?.(
    {
      config: { brandId: 'brand-1', prompt: 'Write a launch post', ...config },
      id: 'post-gen',
      inputs: [],
      label: 'Generate post',
      type: 'postGen',
    },
    new Map(),
    {
      organizationId: 'org-1',
      runId: 'run-1',
      userId: 'user-1',
      workflowId: 'wf-1',
    },
  );
}

describe('WorkflowContentExecutorRegistrarService', () => {
  it('persists a domain platform from a Prisma SCREAMING credential', async () => {
    const postsService = {
      create: vi.fn().mockResolvedValue({
        description: 'Draft body',
        id: 'post-1',
        label: 'Draft body',
        platform: Platform.TWITTER,
        status: 'draft',
      }),
    };
    // An explicit credentialId is exact: no fan-out, no platform guess.
    const credentialsService = {
      findOne: vi.fn().mockResolvedValue({
        id: 'cred-1',
        platform: 'TWITTER',
      }),
    };
    const fanoutService = { resolveTargets: vi.fn() };

    await runPostGenNode(
      { credentialId: 'cred-1' },
      { credentialsService, fanoutService, postsService },
    );

    expect(fanoutService.resolveTargets).not.toHaveBeenCalled();
    expect(credentialsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        id: 'cred-1',
        isConnected: true,
        isDeleted: false,
        organizationId: 'org-1',
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

  it('creates one post per connected account when the node names a platform', async () => {
    const postsService = {
      create: vi
        .fn()
        .mockResolvedValueOnce({
          description: 'Draft body',
          id: 'post-1',
          label: 'Draft body',
          platform: Platform.TWITTER,
          status: 'draft',
        })
        .mockResolvedValueOnce({
          description: 'Draft body, rephrased',
          id: 'post-2',
          label: 'Draft body, rephrased',
          platform: Platform.TWITTER,
          status: 'draft',
        }),
    };
    const credentialsService = { findOne: vi.fn() };
    const targets: PostAccountTarget[] = [
      {
        caption: 'Draft body',
        credentialId: 'cred-1',
        platform: Platform.TWITTER,
      },
      {
        caption: 'Draft body, rephrased',
        credentialId: 'cred-2',
        platform: Platform.TWITTER,
      },
    ];
    const fanoutService = {
      resolveTargets: vi.fn().mockResolvedValue(targets),
    };

    const result = (await runPostGenNode(
      { platform: Platform.TWITTER },
      { credentialsService, fanoutService, postsService },
    )) as { groupId: string; id: string; postIds: string[] };

    expect(credentialsService.findOne).not.toHaveBeenCalled();
    expect(fanoutService.resolveTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: 'org-1',
        platforms: [Platform.TWITTER],
      }),
    );
    expect(postsService.create).toHaveBeenCalledTimes(2);
    expect(result.postIds).toEqual(['post-1', 'post-2']);
    // The node still reports one primary post so downstream nodes keep working.
    expect(result.id).toBe('post-1');

    const first = postsService.create.mock.calls[0]?.[0];
    const second = postsService.create.mock.calls[1]?.[0];

    expect(second.description).toBe('Draft body, rephrased');
    expect(first.groupId).toBe(result.groupId);
    expect(second.groupId).toBe(result.groupId);
  });

  it('skips when the node names neither an account nor a platform', async () => {
    const postsService = { create: vi.fn() };
    const credentialsService = { findOne: vi.fn() };
    const fanoutService = { resolveTargets: vi.fn() };

    const result = (await runPostGenNode(
      {},
      { credentialsService, fanoutService, postsService },
    )) as { reason: string; status: string };

    expect(result).toEqual({ reason: 'no_target_account', status: 'skipped' });
    expect(credentialsService.findOne).not.toHaveBeenCalled();
    expect(fanoutService.resolveTargets).not.toHaveBeenCalled();
    expect(postsService.create).not.toHaveBeenCalled();
  });
});

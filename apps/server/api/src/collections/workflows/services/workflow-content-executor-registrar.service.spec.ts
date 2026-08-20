import { WorkflowContentExecutorRegistrarService } from '@api/collections/workflows/services/workflow-content-executor-registrar.service';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { CredentialPlatform } from '@genfeedai/enums';
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

describe('WorkflowContentExecutorRegistrarService', () => {
  it('persists a domain platform from a Prisma SCREAMING credential', async () => {
    const postsService = {
      create: vi.fn().mockResolvedValue({
        description: 'Draft body',
        id: 'post-1',
        label: 'Draft body',
        platform: CredentialPlatform.TWITTER,
        status: 'draft',
      }),
    };
    const credentialsService = {
      findOne: vi.fn().mockResolvedValue({
        id: 'cred-1',
        platform: 'TWITTER',
      }),
    };
    const openRouterService = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'Draft body' } }],
      }),
    };

    const engine = new WorkflowEngine();
    new WorkflowContentExecutorRegistrarService(
      createHelper(),
      postsService as never,
      credentialsService as never,
      undefined,
      openRouterService as never,
    ).register(engine);

    await engine.getExecutor('postGen')?.(
      {
        config: {
          brandId: 'brand-1',
          prompt: 'Write a launch post',
        },
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

    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-1',
        platform: CredentialPlatform.TWITTER,
      }),
    );
    expect(postsService.create.mock.calls[0]?.[0].platform).toBe('twitter');
  });
});

import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowTrendPublishExecutorRegistrarService } from '@api/collections/workflows/services/workflow-trend-publish-executor-registrar.service';
import { CredentialPlatform } from '@genfeedai/enums';
import {
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

describe('WorkflowTrendPublishExecutorRegistrarService', () => {
  it('persists a domain platform from a Prisma SCREAMING credential', async () => {
    const postsService = {
      create: vi.fn().mockResolvedValue({ id: 'post-1' }),
    };
    const credentialsService = {
      findOne: vi.fn().mockResolvedValue({
        id: 'cred-1',
        platform: 'TWITTER',
      }),
    };

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
      credentialsService as never,
    ).register(engine);

    await engine.getExecutor('publish')?.(
      {
        config: {
          caption: 'Launch post',
          platforms: { twitter: true },
          schedule: { type: 'immediate' },
        },
        id: 'publish',
        inputs: [],
        label: 'Publish',
        type: 'publish',
      },
      new Map([['brand', 'brand-1']]),
      {
        organizationId: 'org-1',
        runId: 'run-1',
        userId: 'user-1',
        workflowId: 'wf-1',
      },
    );

    expect(credentialsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'TWITTER',
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
});

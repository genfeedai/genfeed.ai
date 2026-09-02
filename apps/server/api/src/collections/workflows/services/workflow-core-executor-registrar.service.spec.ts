import { WorkflowCoreExecutorRegistrarService } from '@api/collections/workflows/services/workflow-core-executor-registrar.service';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import {
  createExecutableActionNode,
  type INodeExecutor,
  type NodeExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';

/**
 * Registration regression guard for #481.
 *
 * The `brand` node has a real executor (`createBrandExecutor`) that was never
 * wired into any registrar — unlike its siblings `brandAsset` / `brandContext`.
 * A `brand` node therefore failed at runtime with "No executor registered".
 * This asserts the brand-scoped executors are registered when a BrandsService
 * is available, and skipped when it is not.
 */
describe('WorkflowCoreExecutorRegistrarService', () => {
  // Registration only needs wrapEngineExecutor to return a NodeExecutor; the
  // wrapped executor is never invoked in these tests.
  const helper = {
    wrapEngineExecutor: () => async () => ({}),
  } as unknown as WorkflowEngineExecutorHelperService;

  const logger = {
    debug: () => {},
    error: () => {},
    log: () => {},
    warn: () => {},
  } as never;

  function register(brandsService?: unknown): string[] {
    const engine = new WorkflowEngine();
    new WorkflowCoreExecutorRegistrarService(
      helper,
      logger,
      brandsService as never,
    ).register(engine);
    return engine.getRegisteredActionIds();
  }

  it('registers brand-scoped executors when BrandsService is available', () => {
    const registered = register({ findOne: async () => null });

    expect(registered).toContain('brand');
    expect(registered).toContain('brandAsset');
    expect(registered).toContain('brandContext');
    expect(registered).toContain('analyticsFeedback');
  });

  it('skips brand-scoped executors when BrandsService is absent', () => {
    const registered = register(undefined);

    expect(registered).not.toContain('brand');
    expect(registered).not.toContain('brandAsset');
    expect(registered).not.toContain('brandContext');
  });

  it('registers executable conditional branch semantics', async () => {
    const engine = new WorkflowEngine();
    new WorkflowCoreExecutorRegistrarService(helper, logger).register(engine);
    const executor = engine.getExecutor('condition');

    const result = await executor?.(
      {
        config: {
          customField: 'hookReviewRequired',
          field: 'custom',
          operator: 'isTrue',
        },
        id: 'hook-review-condition',
        inputs: ['value'],
        label: 'Require hook review',
        type: 'condition',
      },
      new Map([['value', { hookReviewRequired: true }]]),
      {
        organizationId: 'org-1',
        runId: 'run-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
        workflowVersionId: 'version-1',
      },
    );

    expect(result).toEqual({
      data: { hookReviewRequired: true },
      result: true,
      value: true,
    });
    expect(engine.getRegisteredNodeTypes()).toContain('condition');
  });

  it('registers durable delay metadata for the graph runner', async () => {
    const engine = new WorkflowEngine();
    new WorkflowCoreExecutorRegistrarService(helper, logger).register(engine);
    const executor = engine.getExecutor('delay');

    const result = await executor?.(
      {
        config: { duration: 2, mode: 'fixed', unit: 'minutes' },
        id: 'delay-publication',
        inputs: ['trigger'],
        label: 'Delay publication',
        type: 'delay',
      },
      new Map([['trigger', { postId: 'post-1' }]]),
      {
        organizationId: 'org-1',
        runId: 'run-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
        workflowVersionId: 'version-1',
      },
    );

    expect(result).toMatchObject({
      data: { postId: 'post-1' },
      delayMs: 120_000,
    });
    const resumeAt =
      result && typeof result === 'object' && 'resumeAt' in result
        ? result.resumeAt
        : undefined;
    expect(Date.parse(String(resumeAt))).toBeGreaterThan(Date.now());
    expect(engine.getRegisteredNodeTypes()).toContain('delay');
  });

  it('resolves the full effective voice while retaining the legacy voice string', async () => {
    const executionHelper = {
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
    const engine = new WorkflowEngine();
    const brandsService = {
      findOne: async () => ({
        agentConfig: {
          voice: {
            audience: ['founders'],
            bannedPhrases: ['game-changing'],
            style: 'concise',
            tone: 'direct',
          },
        },
        backgroundColor: null,
        fontFamily: null,
        id: 'brand-1',
        label: 'Acme',
        primaryColor: null,
        secondaryColor: null,
        slug: 'acme',
      }),
      resolveBrandKitAssets: async () => null,
    };
    new WorkflowCoreExecutorRegistrarService(
      executionHelper,
      logger,
      brandsService as never,
    ).register(engine);

    const executor = engine.getExecutor('genfeedAction');
    const result = await executor?.(
      createExecutableActionNode({
        actionId: 'brandContext',
        id: 'node-1',
        label: 'Brand Context',
        parameters: { brandId: 'brand-1' },
      }),
      new Map(),
      {
        organizationId: 'org-1',
        runId: 'run-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
        workflowVersionId: 'version-1',
      },
    );

    expect(result).toMatchObject({
      voice: 'concise',
      voiceConfig: {
        audience: ['founders'],
        bannedPhrases: ['game-changing'],
        style: 'concise',
        tone: 'direct',
      },
    });
  });
});

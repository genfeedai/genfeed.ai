import {
  buildClipContinuityQaWorkflowDefinition,
  buildClipContinuityWorkflowDefinition,
} from '@api/collections/clip-projects/services/clip-continuity-workflow-definition';
import {
  buildClipFactoryWorkflowDefinition,
  buildClipGenerationChildWorkflowDefinition,
} from '@api/collections/clip-projects/services/clip-factory-workflow-definition';
import { buildClipGenerationWorkflowDefinition } from '@api/collections/clip-projects/services/clip-generation-workflow-definition';
import {
  buildVisualProjectFailureWorkflowDefinition,
  buildVisualProjectWorkflowDefinition,
} from '@api/collections/visual-projects/services/visual-project-workflow-definition';
import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import { buildWorkflowVersionDefinition } from '@api/collections/workflows/workflow-version-definition';
import { WORKFLOW_EXECUTOR } from '@api/collections/workflows/workflows.tokens';
import {
  getOrganizationModuleExecutionContext,
  runWithOrganizationModule,
} from '@api/common/organization-modules/organization-module-execution.context';
import {
  buildCampaignDmBatchWorkflowDefinition,
  buildCampaignDmWorkflowDefinition,
} from '@api/services/campaign/campaign-dm-workflow-definition';
import {
  buildCampaignReplyBatchWorkflowDefinition,
  buildCampaignReplyPreviewWorkflowDefinition,
  buildCampaignReplyWorkflowDefinition,
} from '@api/services/campaign/campaign-reply-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import type { NodeExecutor } from '@genfeedai/workflows/engine';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
  WORKFLOW_FOR_EACH_ACTION_ID,
  WORKFLOW_FOR_EACH_TENANT_ACTION_ID,
  WORKFLOW_RUN_CHILD_ACTION_ID,
} from './system-workflow-runner.service';

const definition: SystemWorkflowGraphDefinition = {
  canonicalId: 'clip-hook-review',
  definition: {
    edges: [],
    nodes: [
      createGenfeedActionNode({
        actionId: 'youtube.resolve-source',
        id: 'review-hook',
      }),
    ],
  },
  description: 'Review one generated hook clip.',
  label: 'Clip Hook Review',
  resultNodeId: 'review-hook',
};

describe('SystemWorkflowRunnerService definitions', () => {
  const service = new SystemWorkflowRunnerService({} as never, {} as never);
  const mismatchedInput = {
    actionType: 'clip-hook-review',
    canonicalId: 'different-workflow',
    organizationId: 'org-1',
    source: 'clip-generation',
    userId: 'user-1',
  };

  it('rejects an unregistered completed workflow identity', async () => {
    await expect(service.runWorkflow(mismatchedInput)).rejects.toThrow(
      'Unknown system workflow: different-workflow',
    );
  });

  it('rejects an unregistered pausable workflow identity', async () => {
    await expect(service.startWorkflow(mismatchedInput)).rejects.toThrow(
      'Unknown system workflow: different-workflow',
    );
  });

  it('rejects a registered workflow whose result node is absent', () => {
    expect(() =>
      service.registerWorkflow({
        ...definition,
        canonicalId: 'missing-result',
        resultNodeId: 'missing',
      }),
    ).toThrow('result node missing does not exist');
  });

  it('passes the stable run-and-node idempotency key to action executors', async () => {
    const { executors, runner } = createRunner();
    const action = vi.fn().mockResolvedValue({ sourceId: 'source-1' });
    runner.registerAction('youtube.resolve-source', action);

    await executors.get('youtube.resolve-source')?.(
      {
        config: { actionId: 'youtube.resolve-source' },
        id: 'resolve-source',
        inputs: [],
        label: 'Resolve source',
        type: 'genfeedAction',
      },
      new Map(),
      executionContext(),
    );

    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        provenance: expect.objectContaining({
          executionId: 'parent-execution',
          idempotencyKey: 'workflow:parent-execution:resolve-source',
          nodeId: 'resolve-source',
        }),
      }),
    );
  });

  it('fails closed at bootstrap when a registered graph action has no executor', () => {
    const { runner } = createRunner();
    runner.registerWorkflow(definition);

    expect(() => runner.onApplicationBootstrap()).toThrow(
      'System workflow action executors missing: clip-hook-review:youtube.resolve-source',
    );
  });

  it('fails closed when a static for-each child workflow is not registered', () => {
    const { runner } = createRunner();
    runner.onModuleInit();
    runner.registerWorkflow({
      canonicalId: 'parent-workflow',
      definition: {
        edges: [],
        nodes: [
          createGenfeedActionNode({
            actionId: WORKFLOW_FOR_EACH_ACTION_ID,
            id: 'fan-out',
            parameters: { childWorkflowId: 'missing-child' },
          }),
        ],
      },
      description: 'Parent',
      label: 'Parent',
      resultNodeId: 'fan-out',
    });

    expect(() => runner.onApplicationBootstrap()).toThrow(
      'System workflow child definitions missing: parent-workflow:fan-out:missing-child',
    );
  });

  it('fails closed when a static run-child workflow is not registered', () => {
    const { runner } = createRunner();
    runner.onModuleInit();
    runner.registerWorkflow({
      canonicalId: 'parent-workflow',
      definition: {
        edges: [],
        nodes: [
          createGenfeedActionNode({
            actionId: WORKFLOW_RUN_CHILD_ACTION_ID,
            id: 'run-child',
            parameters: { childWorkflowId: 'missing-child' },
          }),
        ],
      },
      description: 'Parent',
      label: 'Parent',
      resultNodeId: 'run-child',
    });

    expect(() => runner.onApplicationBootstrap()).toThrow(
      'System workflow child definitions missing: parent-workflow:run-child:missing-child',
    );
  });

  it('executes one global hidden mirror with the invoking tenant context', async () => {
    const immutableDefinition = buildWorkflowVersionDefinition(
      definition.definition,
    );
    const mirror = {
      currentVersion: {
        contentHash: immutableDefinition.contentHash,
        graph: immutableDefinition.graph,
        id: 'global-version',
        inputSchema: immutableDefinition.inputSchema,
        version: 1,
      },
      currentVersionId: 'global-version',
      id: 'global-workflow',
      isDeleted: false,
      label: definition.label,
      metadata: {
        sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
        [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
          canonicalId: definition.canonicalId,
        }),
      },
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
    };
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      workflow: {
        findFirst: vi.fn().mockResolvedValue(mirror),
        update: vi.fn().mockResolvedValue(mirror),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
    };
    const executeManualWorkflowDocument = vi.fn().mockResolvedValue({
      executionId: 'execution-1',
    });
    const adapter = {
      getRegisteredActionIds: vi.fn(),
      registerExecutor: vi.fn(),
    };
    const moduleRef = {
      get: (token: unknown) =>
        token === WORKFLOW_EXECUTOR
          ? { executeManualWorkflowDocument }
          : adapter,
    };
    const runner = new SystemWorkflowRunnerService(
      prisma as never,
      moduleRef as never,
    );
    runner.registerWorkflow(definition);

    await runner.startWorkflow({
      actionType: definition.canonicalId,
      canonicalId: definition.canonicalId,
      organizationId: 'tenant-org',
      source: 'test',
      userId: 'tenant-user',
    });

    expect(transaction.workflow.findFirst).toHaveBeenCalledWith({
      include: { currentVersion: true },
      where: {
        isDeleted: false,
        metadata: {
          equals: definition.canonicalId,
          path: [SYSTEM_WORKFLOW_METADATA_KEY, 'canonicalId'],
        },
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      },
    });
    expect(transaction.workflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: definition.description,
          label: definition.label,
          metadata: expect.objectContaining({
            sourceTemplateId: definition.canonicalId,
            sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
          }),
        }),
        where: { id: 'global-workflow' },
      }),
    );
    expect(executeManualWorkflowDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'global-workflow',
        organizationId: 'tenant-org',
        userId: 'tenant-user',
      }),
      'tenant-user',
      'tenant-org',
      {},
      expect.objectContaining({
        canonicalId: definition.canonicalId,
        isSystemAction: true,
      }),
      expect.anything(),
    );
  });

  describe('hidden mirror serialization conflicts', () => {
    function buildRunner(transaction: ReturnType<typeof vi.fn>) {
      const immutableDefinition = buildWorkflowVersionDefinition(
        definition.definition,
      );
      const mirror = {
        currentVersion: {
          contentHash: immutableDefinition.contentHash,
          graph: immutableDefinition.graph,
          id: 'global-version',
          inputSchema: immutableDefinition.inputSchema,
          version: 1,
        },
        currentVersionId: 'global-version',
        id: 'global-workflow',
        isDeleted: false,
        label: definition.label,
        metadata: {
          sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
          [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
            canonicalId: definition.canonicalId,
          }),
        },
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      };
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        workflow: {
          findFirst: vi.fn().mockResolvedValue(mirror),
          update: vi.fn().mockResolvedValue(mirror),
        },
      };
      const prisma = {
        $transaction: transaction.mockImplementation((callback) =>
          callback(tx),
        ),
      };
      const executeManualWorkflowDocument = vi.fn().mockResolvedValue({
        executionId: 'execution-1',
      });
      const adapter = {
        getRegisteredActionIds: vi.fn(),
        registerExecutor: vi.fn(),
      };
      const moduleRef = {
        get: (token: unknown) =>
          token === WORKFLOW_EXECUTOR
            ? { executeManualWorkflowDocument }
            : adapter,
      };
      const runner = new SystemWorkflowRunnerService(
        prisma as never,
        moduleRef as never,
      );
      runner.registerWorkflow(definition);
      return { executeManualWorkflowDocument, runner };
    }

    const start = (runner: SystemWorkflowRunnerService) =>
      runner.startWorkflow({
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        organizationId: 'tenant-org',
        source: 'test',
        userId: 'tenant-user',
      });

    const p2034 = () =>
      Object.assign(new Error('Transaction failed due to a write conflict'), {
        code: 'P2034',
      });

    it('retries a P2034 abort and still starts the workflow', async () => {
      const $transaction = vi.fn();
      const { executeManualWorkflowDocument, runner } =
        buildRunner($transaction);
      const run = $transaction.getMockImplementation();
      $transaction
        .mockRejectedValueOnce(p2034())
        .mockRejectedValueOnce(
          Object.assign(new Error('TransactionWriteConflict'), {
            name: 'DriverAdapterError',
          }),
        )
        .mockImplementation(run as never);

      await start(runner);

      expect($transaction).toHaveBeenCalledTimes(3);
      expect(executeManualWorkflowDocument).toHaveBeenCalledTimes(1);
    });

    it('surfaces the conflict once the attempts are exhausted', async () => {
      const $transaction = vi.fn();
      const { executeManualWorkflowDocument, runner } =
        buildRunner($transaction);
      $transaction.mockRejectedValue(p2034());

      await expect(start(runner)).rejects.toMatchObject({ code: 'P2034' });

      expect($transaction).toHaveBeenCalledTimes(5);
      expect(executeManualWorkflowDocument).not.toHaveBeenCalled();
    });

    it('does not retry an error that is not a serialization failure', async () => {
      const $transaction = vi.fn();
      const { runner } = buildRunner($transaction);
      $transaction.mockRejectedValue(new Error('connection refused'));

      await expect(start(runner)).rejects.toThrow('connection refused');

      expect($transaction).toHaveBeenCalledTimes(1);
    });
  });

  it('precreates and queues one immutable parent execution', async () => {
    const queueSystemWorkflow = vi.fn().mockResolvedValue('queued-parent');
    const createExecution = vi.fn().mockResolvedValue({
      id: 'parent-execution',
      status: 'PENDING',
    });
    const { runner } = createRunner(
      { queueSystemWorkflow },
      {},
      {},
      { createExecution },
    );
    runner.registerWorkflow(definition);
    const internals = runner as unknown as RunnerInternals;
    vi.spyOn(internals, 'resolveUserId').mockResolvedValue('tenant-user');
    vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror').mockResolvedValue({
      currentVersion: { id: 'global-version' },
      id: 'global-workflow',
      label: definition.label,
    });

    await expect(
      runner.enqueueWorkflow(
        {
          actionType: definition.canonicalId,
          canonicalId: definition.canonicalId,
          idempotencyKey: 'workspace-task:subtask-1',
          inputValues: { ingredientIds: ['ingredient-1'] },
          metadata: { batchExecution: { itemCount: 1 } },
          organizationId: 'tenant-org',
          source: 'batch',
          userId: 'tenant-user',
        },
        { dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
      ),
    ).resolves.toEqual({
      executionId: 'parent-execution',
      status: 'PENDING',
    });
    expect(createExecution).toHaveBeenCalledWith(
      'tenant-user',
      'tenant-org',
      expect.objectContaining({
        idempotencyKey: 'workspace-task:subtask-1',
        workflowId: 'global-workflow',
        workflowVersionId: 'global-version',
      }),
    );
    expect(queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalId: definition.canonicalId }),
      'system-workflow-parent-execution',
      expect.objectContaining({
        priorExecution: expect.objectContaining({
          executionId: 'parent-execution',
          status: 'PENDING',
          workflowId: 'global-workflow',
        }),
      }),
    );
  });

  it('queues only registered Motion compensation with the original input, ignoring caller policy metadata', async () => {
    const queueSystemWorkflow = vi.fn().mockResolvedValue('job');
    const createExecution = vi
      .fn()
      .mockResolvedValue({ id: 'motion-execution' });
    const { runner } = createRunner(
      { queueSystemWorkflow },
      {},
      {},
      { createExecution },
      {
        assertAccess: vi.fn().mockResolvedValue(undefined),
      },
    );
    runner.registerWorkflow(buildVisualProjectWorkflowDefinition());
    runner.registerWorkflow(buildVisualProjectFailureWorkflowDefinition());
    const internals = runner as unknown as RunnerInternals;
    vi.spyOn(internals, 'resolveUserId').mockResolvedValue('user');
    vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror').mockResolvedValue({
      currentVersion: { id: 'motion-version' },
      id: 'motion-workflow',
      label: 'Motion',
    });
    const inputValues = {
      job: {
        revisionId: 'revision',
        organizationId: 'org',
        brandId: 'brand',
        userId: 'user',
      },
    };
    await runner.enqueueWorkflow(
      {
        canonicalId: 'visual-code.execute',
        actionType: 'visual-code.execute',
        organizationId: 'org',
        userId: 'user',
        source: 'visual-code',
        inputValues,
        metadata: {
          failureWorkflow: {
            canonicalId: 'attacker',
            inputValues: { job: 'foreign' },
          },
        },
      },
      { dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE },
    );
    expect(queueSystemWorkflow.mock.calls[0][2].failureWorkflow).toEqual({
      canonicalId: 'visual-code.failure',
      inputValues,
    });
  });

  it('rejects missing fixed compensation at bootstrap and rejects self-compensation', () => {
    const { runner } = createRunner();
    runner.registerAction('visual-code.execute-internal', vi.fn());
    runner.registerWorkflow(buildVisualProjectWorkflowDefinition());
    expect(() => runner.onApplicationBootstrap()).toThrow(
      'System workflow failure definitions missing: visual-code.execute:visual-code.failure',
    );
    expect(() =>
      runner.registerWorkflow({
        ...definition,
        failureWorkflowCanonicalId: definition.canonicalId,
      }),
    ).toThrow('Invalid code-owned system workflow failure definition');
    runner.registerAction('visual-code.fail-internal', vi.fn());
    runner.registerWorkflow(buildVisualProjectFailureWorkflowDefinition());
    expect(() => runner.onApplicationBootstrap()).not.toThrow();
  });

  it('resolves legacy compensation only from a registered graph and rejects missing targets', () => {
    const { runner } = createRunner();
    const input = {
      canonicalId: 'visual-code.execute',
      inputValues: { job: { revisionId: 'revision' } },
    };
    expect(runner.getRegisteredFailureWorkflow(input)).toBeUndefined();
    runner.registerWorkflow(buildVisualProjectWorkflowDefinition());
    expect(() => runner.getRegisteredFailureWorkflow(input)).toThrow(
      'System workflow failure definitions missing',
    );
    runner.registerWorkflow(buildVisualProjectFailureWorkflowDefinition());
    expect(runner.getRegisteredFailureWorkflow(input)).toEqual({
      canonicalId: 'visual-code.failure',
      inputValues: input.inputValues,
    });
    expect(
      runner.getRegisteredFailureWorkflow({
        canonicalId: 'visual-code.failure',
      }),
    ).toBeUndefined();
  });

  it.each([
    'agent.turn.execute',
    'agent.thread.ui-action',
    'agent.thread.input-response',
    'clip-hook-review',
  ])('sets safe queue attempts for %s', async (canonicalId) => {
    const queueSystemWorkflow = vi.fn().mockResolvedValue('job');
    const createExecution = vi
      .fn()
      .mockResolvedValue({ id: 'execution-1', status: 'PENDING' });
    const { runner } = createRunner(
      { queueSystemWorkflow },
      {},
      {},
      { createExecution },
    );
    runner.registerWorkflow({ ...definition, canonicalId });
    const internals = runner as unknown as RunnerInternals;
    vi.spyOn(internals, 'resolveUserId').mockResolvedValue('tenant-user');
    vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror').mockResolvedValue({
      currentVersion: { id: 'version-1' },
      id: 'workflow-1',
      label: 'Workflow',
    });
    await runner.enqueueWorkflow(
      {
        actionType: canonicalId,
        canonicalId,
        organizationId: 'org-1',
        source: 'agent',
        userId: 'tenant-user',
      },
      { dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE },
    );
    const options = queueSystemWorkflow.mock.calls[0][2];
    if (canonicalId === 'clip-hook-review') {
      expect(options).not.toHaveProperty('attempts');
    } else {
      expect(options.attempts).toBe(1);
    }
  });

  it.each([
    ['agent.turn.execute', 'agent'],
    ['agent.thread.ui-action', 'agent'],
    ['agent.thread.input-response', 'agent'],
    ['clip-hook-review', 'agent'],
  ])(
    'keeps %s from source %s off the platform queue (#5162)',
    async (canonicalId, source) => {
      const queueSystemWorkflow = vi.fn().mockResolvedValue('job');
      const createExecution = vi
        .fn()
        .mockResolvedValue({ id: 'execution-1', status: 'PENDING' });
      const { runner } = createRunner(
        { queueSystemWorkflow },
        {},
        {},
        { createExecution },
      );
      runner.registerWorkflow({ ...definition, canonicalId });
      const internals = runner as unknown as RunnerInternals;
      vi.spyOn(internals, 'resolveUserId').mockResolvedValue('tenant-user');
      vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror').mockResolvedValue(
        {
          currentVersion: { id: 'version-1' },
          id: 'workflow-1',
          label: 'Workflow',
        },
      );
      await runner.enqueueWorkflow(
        {
          actionType: canonicalId,
          canonicalId,
          organizationId: 'org-1',
          source,
          userId: 'tenant-user',
        },
        { dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE },
      );
      const options = queueSystemWorkflow.mock.calls[0][2];
      expect(options.usePlatformQueue).toBeUndefined();
    },
  );

  it.each([
    ['PlatformWorkflowSchedulesService', 'analytics-sync'],
    ['proactive', 'agent.turn.execute'],
  ])(
    'routes a %s dispatch to the platform queue (#5162)',
    async (source, canonicalId) => {
      const queueSystemWorkflow = vi.fn().mockResolvedValue('job');
      const createExecution = vi
        .fn()
        .mockResolvedValue({ id: 'execution-1', status: 'PENDING' });
      const { runner } = createRunner(
        { queueSystemWorkflow },
        {},
        {},
        { createExecution },
      );
      runner.registerWorkflow({ ...definition, canonicalId });
      const internals = runner as unknown as RunnerInternals;
      vi.spyOn(internals, 'resolveUserId').mockResolvedValue('tenant-user');
      vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror').mockResolvedValue(
        {
          currentVersion: { id: 'version-1' },
          id: 'workflow-1',
          label: 'Workflow',
        },
      );
      await runner.enqueueWorkflow(
        {
          actionType: canonicalId,
          canonicalId,
          organizationId: 'org-1',
          source,
          userId: 'tenant-user',
        },
        { dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
      );
      const options = queueSystemWorkflow.mock.calls[0][2];
      expect(options.usePlatformQueue).toBe(true);
    },
  );

  it('marks a precreated parent failed when queueing fails', async () => {
    const queueError = new Error('queue unavailable');
    const queueSystemWorkflow = vi.fn().mockRejectedValue(queueError);
    const createExecution = vi.fn().mockResolvedValue({
      id: 'parent-execution',
      status: 'PENDING',
    });
    const completeExecution = vi.fn().mockResolvedValue({
      id: 'parent-execution',
      status: 'FAILED',
    });
    const { runner } = createRunner(
      { queueSystemWorkflow },
      {},
      {},
      { completeExecution, createExecution },
    );
    runner.registerWorkflow(definition);
    const internals = runner as unknown as RunnerInternals;
    vi.spyOn(internals, 'resolveUserId').mockResolvedValue('tenant-user');
    vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror').mockResolvedValue({
      currentVersion: { id: 'global-version' },
      id: 'global-workflow',
      label: definition.label,
    });

    await expect(
      runner.enqueueWorkflow(
        {
          actionType: definition.canonicalId,
          canonicalId: definition.canonicalId,
          organizationId: 'tenant-org',
          source: 'batch',
          userId: 'tenant-user',
        },
        { dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
      ),
    ).rejects.toBe(queueError);
    expect(completeExecution).toHaveBeenCalledWith(
      'parent-execution',
      'tenant-org',
      'queue unavailable',
    );
  });

  it('runs one registered child with mapped inputs and parent provenance', async () => {
    const { executors, runner } = createRunner();
    runner.onModuleInit();
    runner.registerWorkflow(definition);
    vi.spyOn(runner, 'runWorkflow').mockResolvedValue({
      provenance: {
        executionId: 'child-execution',
        workflowId: 'child-workflow',
        workflowLabel: 'Child workflow',
      },
      result: { sourceId: 'source-1' },
    });

    const result = await executors.get(WORKFLOW_RUN_CHILD_ACTION_ID)?.(
      {
        config: { childWorkflowId: definition.canonicalId },
        id: 'run-child',
        inputs: ['request'],
        label: 'Run child',
        type: 'genfeedAction',
      },
      new Map([['request', { sourceId: 'source-1' }]]),
      executionContext(),
    );

    expect(result).toEqual({ sourceId: 'source-1' });
    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: definition.canonicalId,
        inputValues: { request: { sourceId: 'source-1' } },
        metadata: {
          parentExecutionId: 'parent-execution',
          parentNodeId: 'run-child',
          parentWorkflowId: 'parent-workflow',
        },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
  });

  it('awaits one registered child workflow per item with bounded concurrency', async () => {
    const { executors, runner } = createRunner();
    runner.onModuleInit();
    runner.registerWorkflow(definition);
    vi.spyOn(runner, 'runWorkflow').mockImplementation(async (input) => ({
      provenance: {
        executionId: `execution-${String(input.inputValues?.item)}`,
        nodeId: 'result',
        workflowId: 'child-workflow',
        workflowLabel: 'Child workflow',
      },
      result: input.inputValues?.item,
    }));

    const result = await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      executableForEachNode({
        childWorkflowId: definition.canonicalId,
        itemInputKey: 'item',
        maxConcurrency: 2,
      }),
      new Map([['items', ['a', 'b']]]),
      executionContext(),
    );

    expect(result).toMatchObject({
      count: 2,
      results: [
        { index: 0, result: 'a' },
        { index: 1, result: 'b' },
      ],
    });
    expect(runner.runWorkflow).toHaveBeenCalledTimes(2);
  });

  it('executes the exact tenant workflow version for every pinned child', async () => {
    const executePinnedManualWorkflow = vi.fn().mockResolvedValue({
      execution: {
        executionId: 'child-execution',
        nodeResults: [],
        status: 'COMPLETED',
        workflowId: 'tenant-workflow',
      },
      workflowLabel: 'Tenant workflow',
    });
    const { executors, runner } = createRunner(
      undefined,
      {},
      { executePinnedManualWorkflow },
    );
    runner.onModuleInit();

    const forEachNode = executableForEachNode({
      childWorkflowId: 'tenant-workflow',
      childWorkflowVersionId: 'tenant-version',
    });
    const inputs = new Map([['items', ['ingredient-1']]]);
    const result = await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      forEachNode,
      inputs,
      executionContext(),
    );
    await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      forEachNode,
      inputs,
      executionContext(),
    );

    expect(executePinnedManualWorkflow).toHaveBeenCalledWith(
      'tenant-workflow',
      'tenant-version',
      'user-1',
      'org-1',
      { item: 'ingredient-1' },
      expect.objectContaining({
        childWorkflowVersionId: 'tenant-version',
        parentExecutionId: 'parent-execution',
        workflowForEachIndex: 0,
      }),
      expect.stringMatching(/^workflow-for-each:[a-f0-9]{64}$/),
    );
    expect(result).toMatchObject({
      count: 1,
      results: [
        {
          index: 0,
          provenance: {
            executionId: 'child-execution',
            workflowId: 'tenant-workflow',
          },
        },
      ],
    });
    expect(executePinnedManualWorkflow).toHaveBeenCalledTimes(2);
    expect(executePinnedManualWorkflow.mock.calls[0]?.[6]).toBe(
      executePinnedManualWorkflow.mock.calls[1]?.[6],
    );
  });

  it('collects a failed pinned child without hiding its execution identity', async () => {
    const executePinnedManualWorkflow = vi.fn().mockResolvedValue({
      execution: {
        error: 'Generation failed',
        executionId: 'failed-child-execution',
        nodeResults: [],
        status: 'FAILED',
        workflowId: 'tenant-workflow',
      },
      workflowLabel: 'Tenant workflow',
    });
    const { executors, runner } = createRunner(
      undefined,
      {},
      { executePinnedManualWorkflow },
    );
    runner.onModuleInit();

    const result = await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      executableForEachNode({
        childWorkflowId: 'tenant-workflow',
        childWorkflowVersionId: 'tenant-version',
        failureMode: 'collect',
      }),
      new Map([['items', ['ingredient-1']]]),
      executionContext(),
    );

    expect(result).toEqual({
      count: 1,
      results: [
        {
          error: 'Generation failed',
          executionId: 'failed-child-execution',
          index: 0,
          status: 'failed',
        },
      ],
    });
  });

  it('durably schedules paced children with deterministic delays', async () => {
    const queueSystemWorkflow = vi
      .fn()
      .mockImplementation(async (_input, jobId) => jobId);
    const prisma = {
      workflow: { findFirst: vi.fn().mockResolvedValue(null) },
      workflowExecution: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const { executors, runner } = createRunner({ queueSystemWorkflow }, prisma);
    runner.onModuleInit();
    runner.registerWorkflow(definition);

    const result = await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      executableForEachNode({
        childWorkflowId: definition.canonicalId,
        initialDelayMs: 500,
        interItemDelayMs: 1_000,
        itemInputKey: 'item',
        mode: 'scheduled',
      }),
      new Map([['items', ['a', 'b']]]),
      executionContext(),
    );

    expect(result).toMatchObject({ count: 2 });
    expect(queueSystemWorkflow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ inputValues: { item: 'a' } }),
      expect.stringMatching(/^workflow\.for-each-/),
      expect.objectContaining({ delayMs: 500 }),
    );
    expect(queueSystemWorkflow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ inputValues: { item: 'b' } }),
      expect.stringMatching(/^workflow\.for-each-/),
      expect.objectContaining({ delayMs: 1_500 }),
    );
  });

  it('routes scheduled for-each children to the platform queue when the parent execution was platform-sourced (#5271, replacing isPlatformSweepWorkflow)', async () => {
    const queueSystemWorkflow = vi
      .fn()
      .mockImplementation(async (_input, jobId) => jobId);
    const prisma = {
      workflowExecution: {
        findFirst: vi.fn().mockResolvedValue({
          result: {
            metadata: {
              dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
              source: 'PlatformWorkflowSchedulesService',
            },
          },
        }),
      },
    };
    const { executors, runner } = createRunner({ queueSystemWorkflow }, prisma);
    runner.onModuleInit();
    runner.registerWorkflow(definition);

    await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      executableForEachNode({
        childWorkflowId: definition.canonicalId,
        itemInputKey: 'item',
        mode: 'scheduled',
      }),
      new Map([['items', ['a']]]),
      executionContext(),
    );

    expect(prisma.workflowExecution.findFirst).toHaveBeenCalledWith({
      select: { result: true },
      where: {
        id: 'parent-execution',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(queueSystemWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^workflow\.for-each-/),
      expect.objectContaining({
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
        usePlatformQueue: true,
      }),
    );
  });

  it('routes scheduled for-each children to the background queue when the parent execution was BACKGROUND and not platform-sourced (#5271)', async () => {
    const queueSystemWorkflow = vi
      .fn()
      .mockImplementation(async (_input, jobId) => jobId);
    const prisma = {
      workflowExecution: {
        findFirst: vi.fn().mockResolvedValue({
          result: {
            metadata: {
              dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
              source: 'rss_autopost_sweep',
            },
          },
        }),
      },
    };
    const { executors, runner } = createRunner({ queueSystemWorkflow }, prisma);
    runner.onModuleInit();
    runner.registerWorkflow(definition);

    await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      executableForEachNode({
        childWorkflowId: definition.canonicalId,
        itemInputKey: 'item',
        mode: 'scheduled',
      }),
      new Map([['items', ['a']]]),
      executionContext(),
    );

    expect(queueSystemWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^workflow\.for-each-/),
      expect.objectContaining({
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
      }),
    );
    expect(queueSystemWorkflow).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ usePlatformQueue: true }),
    );
  });

  it('routes scheduled for-each children to the interactive queue when the parent execution was a real interactive dispatch (#5271, issue #2 scenario)', async () => {
    // The scenario the issue's decision #3 named: a future interactive
    // re-dispatch of a canonical id that also happens to be platform-swept
    // (e.g. analytics-sync) must keep its children interactive — not fall
    // back to the platform queue by canonical id the way
    // `isPlatformSweepWorkflow` used to.
    const queueSystemWorkflow = vi
      .fn()
      .mockImplementation(async (_input, jobId) => jobId);
    const prisma = {
      workflowExecution: {
        findFirst: vi.fn().mockResolvedValue({
          result: {
            metadata: {
              dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
              source: 'AnalyticsSyncController.manualRerun',
            },
          },
        }),
      },
    };
    const { executors, runner } = createRunner({ queueSystemWorkflow }, prisma);
    runner.onModuleInit();
    runner.registerWorkflow(definition);

    await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      executableForEachNode({
        childWorkflowId: definition.canonicalId,
        itemInputKey: 'item',
        mode: 'scheduled',
      }),
      new Map([['items', ['a']]]),
      executionContext(),
    );

    expect(queueSystemWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^workflow\.for-each-/),
      expect.objectContaining({
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
      }),
    );
    expect(queueSystemWorkflow).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ usePlatformQueue: true }),
    );
  });

  it('defaults scheduled for-each children to the background queue when the parent execution has no persisted dispatchClass (#5271 fail-safe)', async () => {
    const queueSystemWorkflow = vi
      .fn()
      .mockImplementation(async (_input, jobId) => jobId);
    const prisma = {
      workflowExecution: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const { executors, runner } = createRunner({ queueSystemWorkflow }, prisma);
    runner.onModuleInit();
    runner.registerWorkflow(definition);

    await executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
      executableForEachNode({
        childWorkflowId: definition.canonicalId,
        itemInputKey: 'item',
        mode: 'scheduled',
      }),
      new Map([['items', ['a']]]),
      executionContext(),
    );

    expect(queueSystemWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^workflow\.for-each-/),
      expect.objectContaining({
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
      }),
    );
  });

  it('projects hidden system workflow children into validated tenant ownership', async () => {
    const prisma = {
      organization: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'org-2', userId: 'owner-2' },
          { id: 'org-3', userId: 'owner-3' },
        ]),
      },
      workflow: {
        findFirst: vi.fn().mockResolvedValue({
          metadata: {
            sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
            [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
              canonicalId: 'parent-workflow',
            }),
          },
        }),
      },
    };
    const { executors, runner } = createRunner(undefined, prisma);
    runner.onModuleInit();
    runner.registerWorkflow(definition);
    vi.spyOn(runner, 'runWorkflow').mockResolvedValue({
      provenance: {
        executionId: 'child-execution',
        nodeId: 'result',
        workflowId: 'child-workflow',
        workflowLabel: 'Child workflow',
      },
      result: null,
    });

    await executors.get(WORKFLOW_FOR_EACH_TENANT_ACTION_ID)?.(
      executableForEachNode(
        { childWorkflowId: definition.canonicalId, itemInputKey: 'item' },
        WORKFLOW_FOR_EACH_TENANT_ACTION_ID,
      ),
      new Map([
        ['items', [{ organizationId: 'org-2' }, { organizationId: 'org-3' }]],
      ]),
      executionContext(),
    );

    expect(prisma.workflow.findFirst).toHaveBeenCalledWith({
      select: { metadata: true },
      where: {
        id: 'parent-workflow',
        isDeleted: false,
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      },
    });

    expect(runner.runWorkflow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ organizationId: 'org-2', userId: 'owner-2' }),
    );
    expect(runner.runWorkflow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ organizationId: 'org-3', userId: 'owner-3' }),
    );
  });

  it('rejects tenant projection from a non-system workflow', async () => {
    const prisma = {
      organization: { findMany: vi.fn() },
      workflow: {
        findFirst: vi.fn().mockResolvedValue({
          metadata: { sourceType: 'user-workflow' },
        }),
      },
    };
    const { executors, runner } = createRunner(undefined, prisma);
    runner.onModuleInit();

    await expect(
      executors.get(WORKFLOW_FOR_EACH_TENANT_ACTION_ID)?.(
        executableForEachNode(
          { childWorkflowId: definition.canonicalId },
          WORKFLOW_FOR_EACH_TENANT_ACTION_ID,
        ),
        new Map([['items', [{ organizationId: 'org-2' }]]]),
        executionContext(),
      ),
    ).rejects.toThrow(
      'workflow.for-each-tenant requires a hidden system workflow parent',
    );
  });
});

describe('registered Motion graph admission', () => {
  const motion = buildVisualProjectWorkflowDefinition();
  const input = {
    actionType: motion.canonicalId,
    canonicalId: motion.canonicalId,
    organizationId: 'org-1',
    source: 'visual-code',
    userId: 'user-1',
  };
  function fixture() {
    const assertAccess = vi.fn().mockResolvedValue(undefined);
    const queueSystemWorkflow = vi.fn();
    const createExecution = vi.fn();
    const { runner, executors } = createRunner(
      { queueSystemWorkflow },
      {},
      {},
      { createExecution },
      { assertAccess },
    );
    runner.registerWorkflow(motion);
    const internals = runner as unknown as RunnerInternals;
    const resolveUserId = vi.spyOn(internals, 'resolveUserId');
    const mirror = vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror');
    return {
      runner,
      executors,
      assertAccess,
      queueSystemWorkflow,
      createExecution,
      resolveUserId,
      mirror,
    };
  }
  it.each(['start', 'enqueue'] as const)(
    'denies Motion %s before any execution or queue writes',
    async (mode) => {
      const h = fixture();
      h.assertAccess.mockRejectedValue(
        new ForbiddenException('Motion disabled'),
      );
      await expect(
        mode === 'start'
          ? h.runner.startWorkflow(input)
          : h.runner.enqueueWorkflow(input, {
              dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
            }),
      ).rejects.toThrow('Motion disabled');
      expect(h.assertAccess).toHaveBeenCalledWith('org-1', 'motion');
      expect(h.resolveUserId).not.toHaveBeenCalled();
      expect(h.mirror).not.toHaveBeenCalled();
      expect(h.createExecution).not.toHaveBeenCalled();
      expect(h.queueSystemWorkflow).not.toHaveBeenCalled();
    },
  );
  it('uses registered Motion ownership for legacy resume and rechecks revocation after a warmed run', async () => {
    const h = fixture();
    const work = vi.fn(async () => getOrganizationModuleExecutionContext());
    await expect(
      runWithOrganizationModule(
        { organizationId: 'org-1', moduleId: 'playground' },
        () => h.runner.runWithRegisteredWorkflowModule(input, work),
      ),
    ).resolves.toEqual({ organizationId: 'org-1', moduleId: 'motion' });
    h.assertAccess.mockRejectedValueOnce(
      new ForbiddenException('Motion disabled'),
    );
    await expect(
      h.runner.runWithRegisteredWorkflowModule(input, work),
    ).rejects.toThrow('Motion disabled');
    expect(work).toHaveBeenCalledTimes(1);
  });
  it('does not exempt the provider-capable execute node from fresh module admission', async () => {
    const h = fixture();
    const action = vi.fn().mockResolvedValue(null);
    h.runner.registerAction('visual-code.execute-internal', action);
    const node = {
      config: { actionId: 'visual-code.execute-internal' },
      id: 'execute',
      inputs: [],
      label: 'Execute visual revision',
      type: 'genfeedAction',
    };
    await h.runner.runWithRegisteredWorkflowModule(input, async () => {
      await h.executors.get('visual-code.execute-internal')?.(
        node,
        new Map(),
        executionContext(),
      );
      h.assertAccess.mockRejectedValueOnce(
        new ForbiddenException('Motion disabled'),
      );
      await expect(
        h.executors.get('visual-code.execute-internal')?.(
          node,
          new Map(),
          executionContext(),
        ),
      ).rejects.toThrow('Motion disabled');
    });
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe('System workflow module admission', () => {
  const input = {
    actionType: definition.canonicalId,
    canonicalId: definition.canonicalId,
    organizationId: 'org-1',
    source: 'test',
    userId: 'user-1',
  };
  function admittedRunner() {
    const assertAccess = vi.fn().mockResolvedValue(undefined);
    const queueSystemWorkflow = vi.fn();
    const createExecution = vi.fn();
    const { runner, executors } = createRunner(
      { queueSystemWorkflow },
      {},
      {},
      { createExecution },
      { assertAccess },
    );
    runner.registerWorkflow({ ...definition, organizationModule: 'messages' });
    const internals = runner as unknown as RunnerInternals;
    const resolveUserId = vi.spyOn(internals, 'resolveUserId');
    const mirror = vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror');
    return {
      assertAccess,
      runner,
      executors,
      resolveUserId,
      mirror,
      queueSystemWorkflow,
      createExecution,
    };
  }

  it.each(['start', 'enqueue'] as const)(
    'denies %s before principal, mirror, execution or queue writes',
    async (mode) => {
      const h = admittedRunner();
      h.assertAccess.mockRejectedValue(
        new ForbiddenException('Messages disabled'),
      );
      await expect(
        mode === 'start'
          ? h.runner.startWorkflow(input)
          : h.runner.enqueueWorkflow(input, {
              dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
            }),
      ).rejects.toThrow('Messages disabled');
      expect(h.resolveUserId).not.toHaveBeenCalled();
      expect(h.mirror).not.toHaveBeenCalled();
      expect(h.createExecution).not.toHaveBeenCalled();
      expect(h.queueSystemWorkflow).not.toHaveBeenCalled();
    },
  );

  it('uses the registered module instead of a producer context or caller metadata and rechecks a warmed run', async () => {
    const h = admittedRunner();
    const work = vi.fn(async () => getOrganizationModuleExecutionContext());
    const scope = await runWithOrganizationModule(
      { organizationId: 'org-1', moduleId: 'publishing' },
      () =>
        h.runner.runWithRegisteredWorkflowModule(
          { ...input, ...{ metadata: { organizationModule: 'playground' } } },
          work,
        ),
    );
    expect(scope).toEqual({ organizationId: 'org-1', moduleId: 'messages' });
    expect(h.assertAccess).toHaveBeenCalledWith('org-1', 'messages');
    h.assertAccess.mockRejectedValueOnce(
      new ForbiddenException('Subscription expired'),
    );
    await expect(
      h.runner.runWithRegisteredWorkflowModule(input, work),
    ).rejects.toThrow('Subscription expired');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('rechecks module access before the next side-effect node in an active run', async () => {
    const h = admittedRunner();
    const action = vi.fn().mockResolvedValue(null);
    h.runner.registerAction('youtube.resolve-source', action);
    const node = {
      config: { actionId: 'youtube.resolve-source' },
      id: 'review-hook',
      inputs: [],
      label: 'Resolve',
      type: 'genfeedAction',
    };
    await h.runner.runWithRegisteredWorkflowModule(input, async () => {
      await h.executors.get('youtube.resolve-source')?.(
        node,
        new Map(),
        executionContext(),
      );
      h.assertAccess.mockRejectedValueOnce(
        new ForbiddenException('Messages disabled'),
      );
      await expect(
        h.executors.get('youtube.resolve-source')?.(
          node,
          new Map(),
          executionContext(),
        ),
      ).rejects.toThrow('Messages disabled');
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('lets only code-declared terminal state nodes finish after an admitted side effect', async () => {
    const h = admittedRunner();
    const action = vi.fn().mockResolvedValue(null);
    h.runner.registerAction('youtube.resolve-source', action);
    const provider = vi.fn();
    h.runner.registerAction('social.inbox.outbound.provider', provider);
    h.runner.registerWorkflow({
      ...definition,
      canonicalId: 'terminal',
      organizationModule: 'messages',
      moduleCompletionNodeIds: ['review-hook'],
    });
    const node = {
      config: { actionId: 'youtube.resolve-source' },
      id: 'review-hook',
      inputs: [],
      label: 'Finalize',
      type: 'genfeedAction',
    };
    await h.runner.runWithRegisteredWorkflowModule(
      { canonicalId: 'terminal', organizationId: 'org-1' },
      async () => {
        h.assertAccess.mockRejectedValue(
          new ForbiddenException('Messages disabled'),
        );
        await h.executors.get('youtube.resolve-source')?.(
          node,
          new Map(),
          executionContext(),
        );
        await expect(
          h.executors.get('youtube.resolve-source')?.(
            { ...node, id: 'new-work' },
            new Map(),
            executionContext(),
          ),
        ).rejects.toThrow('Messages disabled');
        await expect(
          h.executors.get('social.inbox.outbound.provider')?.(
            { ...node, config: { actionId: 'social.inbox.outbound.provider' } },
            new Map(),
            executionContext(),
          ),
        ).rejects.toThrow('Messages disabled');
      },
    );
    expect(action).toHaveBeenCalledTimes(1);
    expect(provider).not.toHaveBeenCalled();
    await expect(
      h.runner.runWithRegisteredWorkflowModule(
        { canonicalId: 'terminal', organizationId: 'org-1' },
        async () => null,
      ),
    ).rejects.toThrow('Messages disabled');
  });

  it('never exempts an action in another tenant', async () => {
    const h = admittedRunner();
    const action = vi.fn();
    h.runner.registerAction('youtube.resolve-source', action);
    await h.runner.runWithRegisteredWorkflowModule(input, async () => {
      await expect(
        h.executors.get('youtube.resolve-source')?.(
          {
            config: { actionId: 'youtube.resolve-source' },
            id: 'review-hook',
            inputs: [],
            label: 'Resolve',
            type: 'genfeedAction',
          },
          new Map(),
          { ...executionContext(), organizationId: 'org-2' },
        ),
      ).rejects.toThrow('does not match its tenant');
    });
    expect(action).not.toHaveBeenCalled();
  });

  it('rejects unknown completion nodes and completion policies without a module', () => {
    const h = admittedRunner();
    expect(() =>
      h.runner.registerWorkflow({
        ...definition,
        canonicalId: 'bad',
        organizationModule: 'messages',
        moduleCompletionNodeIds: ['absent'],
      }),
    ).toThrow('Invalid code-owned');
    expect(() =>
      h.runner.registerWorkflow({
        ...definition,
        canonicalId: 'bad',
        moduleCompletionNodeIds: ['review-hook'],
      }),
    ).toThrow('Invalid code-owned');
  });
});

describe('nested scheduled module admission', () => {
  it.each([false, true])(
    'admits a child under its own module before Redis when disabled=%s',
    async (isDisabled) => {
      const assertAccess = vi.fn(async (_org: string, moduleId: string) => {
        if (moduleId === 'messages' && isDisabled)
          throw new ForbiddenException('Messages disabled');
      });
      const queueSystemWorkflow = vi.fn(async () => {
        expect(getOrganizationModuleExecutionContext()).toEqual({
          organizationId: 'org-1',
          moduleId: 'messages',
        });
        return 'queued-child';
      });
      const { runner, executors } = createRunner(
        { queueSystemWorkflow },
        {
          workflowExecution: {
            findFirst: vi.fn().mockResolvedValue({
              result: {
                metadata: {
                  dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
                  source: 'test',
                },
              },
            }),
          },
        },
        {},
        {},
        { assertAccess },
      );
      runner.onModuleInit();
      runner.registerWorkflow({
        ...definition,
        organizationModule: 'messages',
      });
      await runWithOrganizationModule(
        { organizationId: 'org-1', moduleId: 'publishing' },
        async () => {
          const run = executors.get(WORKFLOW_FOR_EACH_ACTION_ID)?.(
            executableForEachNode({
              childWorkflowId: definition.canonicalId,
              itemInputKey: 'item',
              mode: 'scheduled',
            }),
            new Map([['items', ['one']]]),
            executionContext(),
          );
          if (isDisabled)
            await expect(run).rejects.toThrow('Messages disabled');
          else
            await expect(run).resolves.toEqual({
              count: 1,
              results: [{ index: 0, jobId: 'queued-child' }],
            });
          expect(getOrganizationModuleExecutionContext()?.moduleId).toBe(
            'publishing',
          );
        },
      );
      expect(assertAccess).toHaveBeenCalledWith('org-1', 'messages');
      expect(queueSystemWorkflow).toHaveBeenCalledTimes(isDisabled ? 0 : 1);
    },
  );
});

describe('stored delay module ownership', () => {
  const input = {
    executionId: 'execution-1',
    organizationId: 'org-1',
    workflowId: 'workflow-1',
  };
  function harness() {
    const workflow = {
      id: input.workflowId,
      isDeleted: false,
      organizationId: 'org-1',
      userId: 'owner-1',
      metadata: {
        sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
        [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
          canonicalId: definition.canonicalId,
        }),
      },
    };
    const pinned = {
      workflowVersion: {
        organizationId: workflow.organizationId,
        userId: workflow.userId,
        workflowId: input.workflowId,
        workflow,
      },
    };
    const findFirst = vi.fn().mockResolvedValue(pinned);
    const assertAccess = vi.fn().mockResolvedValue(undefined);
    const h = createRunner(
      undefined,
      { workflowExecution: { findFirst } },
      {},
      {},
      { assertAccess },
    );
    h.runner.registerWorkflow({
      ...definition,
      organizationModule: 'messages',
    });
    return { ...h, pinned, findFirst, assertAccess };
  }

  it('binds an old queue job to its tenant and execution, and ignores tenant-authored hidden/module metadata', async () => {
    const h = harness();
    const work = vi.fn(async () => getOrganizationModuleExecutionContext());
    await expect(
      h.runner.runWithStoredWorkflowModule(input, work),
    ).resolves.toEqual({ organizationId: 'org-1', moduleId: 'automation' });
    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'execution-1',
          isDeleted: false,
          organizationId: 'org-1',
          workflowId: 'workflow-1',
        },
      }),
    );
    expect(h.assertAccess).toHaveBeenCalledWith('org-1', 'automation');
  });

  it('resolves a fixed-principal hidden execution through code-owned module policy and rejects revocation after a warmed attempt', async () => {
    const h = harness();
    const version = h.pinned.workflowVersion;
    version.organizationId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
    version.userId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
    version.workflow.organizationId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
    version.workflow.userId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
    const work = vi.fn(async () => getOrganizationModuleExecutionContext());
    await expect(
      h.runner.runWithStoredWorkflowModule(input, work),
    ).resolves.toEqual({ organizationId: 'org-1', moduleId: 'messages' });
    h.assertAccess.mockRejectedValueOnce(
      new ForbiddenException('Subscription expired'),
    );
    await expect(
      h.runner.runWithStoredWorkflowModule(input, work),
    ).rejects.toThrow('Subscription expired');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('keeps a registered global maintenance resume distinct from tenant Automation', async () => {
    const h = harness();
    h.runner.registerWorkflow({ ...definition, canonicalId: 'maintenance' });
    const version = h.pinned.workflowVersion;
    version.organizationId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
    version.userId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
    version.workflow.organizationId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
    version.workflow.userId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
    version.workflow.metadata[SYSTEM_WORKFLOW_METADATA_KEY] =
      buildHiddenSystemWorkflowMetadata({ canonicalId: 'maintenance' });
    const work = vi.fn().mockResolvedValue('reconciled');
    await expect(
      h.runner.runWithStoredWorkflowModule(
        { ...input, organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID },
        work,
      ),
    ).resolves.toBe('reconciled');
    expect(h.assertAccess).not.toHaveBeenCalled();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it.each([
    'missing',
    'wrong-version-workflow',
    'wrong-workflow',
    'deleted',
    'wrong-version-tenant',
    'wrong-version-owner',
    'foreign-tenant',
    'fake-principal-owner',
    'unknown-canonical',
  ] as const)(
    'rejects unsafe saved execution ownership: %s',
    async (problem) => {
      const h = harness();
      const version = h.pinned.workflowVersion;
      if (problem === 'missing') h.findFirst.mockResolvedValue(null);
      if (problem === 'wrong-version-workflow') version.workflowId = 'other';
      if (problem === 'wrong-workflow') version.workflow.id = 'other';
      if (problem === 'deleted') version.workflow.isDeleted = true;
      if (problem === 'wrong-version-tenant') version.organizationId = 'other';
      if (problem === 'wrong-version-owner') version.userId = 'other';
      if (problem === 'foreign-tenant') {
        version.organizationId = 'other';
        version.workflow.organizationId = 'other';
      }
      if (
        problem === 'fake-principal-owner' ||
        problem === 'unknown-canonical'
      ) {
        version.organizationId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
        version.workflow.organizationId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
        if (problem === 'unknown-canonical') {
          version.userId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
          version.workflow.userId = SYSTEM_WORKFLOW_PRINCIPAL_ID;
          version.workflow.metadata[SYSTEM_WORKFLOW_METADATA_KEY] =
            buildHiddenSystemWorkflowMetadata({ canonicalId: 'unknown' });
        }
      }
      const work = vi.fn();
      await expect(
        h.runner.runWithStoredWorkflowModule(input, work),
      ).rejects.toThrow();
      expect(work).not.toHaveBeenCalled();
      expect(h.assertAccess).not.toHaveBeenCalled();
    },
  );

  it.each(['executionId', 'organizationId', 'workflowId'] as const)(
    'rejects a missing %s without reading or executing',
    async (key) => {
      const h = harness();
      const work = vi.fn();
      await expect(
        h.runner.runWithStoredWorkflowModule({ ...input, [key]: ' ' }, work),
      ).rejects.toThrow('requires execution ownership');
      expect(h.findFirst).not.toHaveBeenCalled();
      expect(work).not.toHaveBeenCalled();
    },
  );

  it('fails closed when saved ownership cannot be read', async () => {
    const h = harness();
    h.findFirst.mockRejectedValueOnce(new Error('Database unavailable'));
    const work = vi.fn();
    await expect(
      h.runner.runWithStoredWorkflowModule(input, work),
    ).rejects.toThrow('Database unavailable');
    expect(h.assertAccess).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });
});

function createRunner(
  queue = { queueSystemWorkflow: vi.fn() },
  prisma: object = {},
  workflowExecutor: object = {},
  workflowExecutions: object = {},
  moduleAccess: object = {},
): {
  executors: Map<string, NodeExecutor>;
  runner: SystemWorkflowRunnerService;
} {
  const executors = new Map<string, NodeExecutor>();
  const adapter = {
    getRegisteredActionIds: () => [...executors.keys()],
    registerExecutor: (actionId: string, executor: NodeExecutor) => {
      executors.set(actionId, executor);
    },
  };
  const moduleRef = {
    get: (token: unknown) => {
      const name = (token as { name?: string })?.name;
      if (name === 'OrganizationModuleAccessService') return moduleAccess;
      if (name === 'WorkflowExecutionQueueService') {
        return queue;
      }
      if (token === WORKFLOW_EXECUTOR) {
        return workflowExecutor;
      }
      if (name === 'WorkflowExecutionsService') {
        return workflowExecutions;
      }
      return adapter;
    },
  };
  return {
    executors,
    runner: new SystemWorkflowRunnerService(
      prisma as never,
      moduleRef as never,
    ),
  };
}

type RunnerInternals = {
  ensureHiddenSystemWorkflowMirror: (
    definition: SystemWorkflowGraphDefinition,
  ) => Promise<{
    currentVersion: { id: string };
    id: string;
    label: string;
  }>;
  resolveUserId: (organizationId: string, userId?: string) => Promise<string>;
};

function executableForEachNode(
  config: Record<string, unknown>,
  type = WORKFLOW_FOR_EACH_ACTION_ID,
): Parameters<NodeExecutor>[0] {
  return {
    config,
    id: 'for-each',
    inputs: ['items'],
    label: 'For each item',
    type,
  };
}

function executionContext(): Parameters<NodeExecutor>[2] {
  return {
    executionId: 'parent-execution',
    organizationId: 'org-1',
    runId: 'parent-run',
    userId: 'user-1',
    workflowId: 'parent-workflow',
    workflowVersionId: 'parent-version',
  };
}

describe('registered outbound campaign module admission', () => {
  const definitions = [
    buildCampaignDmWorkflowDefinition(),
    buildCampaignDmBatchWorkflowDefinition(),
    buildCampaignReplyWorkflowDefinition(),
    buildCampaignReplyBatchWorkflowDefinition(),
    buildCampaignReplyPreviewWorkflowDefinition(),
  ];
  it.each(
    definitions.flatMap((graph) =>
      ['start', 'enqueue', 'resume'].map((mode) => ({
        graph,
        canonicalId: graph.canonicalId,
        mode,
      })),
    ),
  )(
    'blocks $canonicalId $mode before any execution, queue, or provider work',
    async ({ graph, mode }) => {
      const assertAccess = vi
        .fn()
        .mockRejectedValue(
          new ForbiddenException(
            'Messages disabled or subscription unavailable',
          ),
        );
      const queueSystemWorkflow = vi.fn();
      const createExecution = vi.fn();
      const { runner } = createRunner(
        { queueSystemWorkflow },
        {},
        {},
        { createExecution },
        { assertAccess },
      );
      runner.registerWorkflow(graph);
      const internals = runner as unknown as RunnerInternals;
      const resolve = vi.spyOn(internals, 'resolveUserId');
      const mirror = vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror');
      const provider = vi.fn();
      const input = {
        canonicalId: graph.canonicalId,
        actionType: graph.canonicalId,
        organizationId: 'org-1',
        userId: 'user-1',
        source: 'legacy-campaign',
        metadata: { organizationModule: 'playground' },
      };
      await expect(
        mode === 'start'
          ? runner.startWorkflow(input)
          : mode === 'enqueue'
            ? runner.enqueueWorkflow(input, {
                dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
              })
            : runner.runWithRegisteredWorkflowModule(input, provider),
      ).rejects.toThrow('Messages disabled or subscription unavailable');
      expect(assertAccess).toHaveBeenCalledWith('org-1', 'messages');
      expect(resolve).not.toHaveBeenCalled();
      expect(mirror).not.toHaveBeenCalled();
      expect(createExecution).not.toHaveBeenCalled();
      expect(queueSystemWorkflow).not.toHaveBeenCalled();
      expect(provider).not.toHaveBeenCalled();
    },
  );
  it.each([
    buildCampaignDmWorkflowDefinition(),
    buildCampaignReplyWorkflowDefinition(),
  ])(
    '$canonicalId permits terminal sent-result projection after revocation but blocks another send',
    async (graph) => {
      const assertAccess = vi.fn().mockResolvedValue(undefined);
      const { runner, executors } = createRunner(
        undefined,
        {},
        {},
        {},
        { assertAccess },
      );
      runner.registerWorkflow(graph);
      const finalized = vi.fn().mockResolvedValue({ success: true });
      const sent = vi.fn();
      const finalAction = String(
        graph.definition.nodes.find((node) => node.id === 'finalize-target')
          ?.data.config.actionId,
      );
      const sendNode = graph.definition.nodes.find((node) =>
        node.id.startsWith('send-'),
      );
      if (!sendNode) throw new Error('campaign send node missing');
      const sendAction = String(sendNode.data.config.actionId);
      runner.registerAction(finalAction, finalized);
      runner.registerAction(sendAction, sent);
      const input = { canonicalId: graph.canonicalId, organizationId: 'org-1' };
      await runner.runWithRegisteredWorkflowModule(input, async () => {
        assertAccess.mockRejectedValue(
          new ForbiddenException('Messages revoked'),
        );
        await executors.get(finalAction)?.(
          {
            config: { actionId: finalAction },
            id: 'finalize-target',
            inputs: [],
            label: 'Finalize',
            type: 'genfeedAction',
          },
          new Map(),
          executionContext(),
        );
        await expect(
          executors.get(sendAction)?.(
            {
              config: { actionId: sendAction },
              id: sendNode.id,
              inputs: [],
              label: 'Send',
              type: 'genfeedAction',
            },
            new Map(),
            executionContext(),
          ),
        ).rejects.toThrow('Messages revoked');
      });
      expect(finalized).toHaveBeenCalledTimes(1);
      expect(sent).not.toHaveBeenCalled();
      expect(assertAccess).toHaveBeenCalledTimes(2);
    },
  );
});

describe('registered Clips module admission', () => {
  const definitions = [
    buildClipFactoryWorkflowDefinition(),
    buildClipGenerationWorkflowDefinition(),
    buildClipGenerationChildWorkflowDefinition(),
    buildClipContinuityWorkflowDefinition(),
    buildClipContinuityQaWorkflowDefinition(),
  ];
  it.each(
    definitions.flatMap((graph) =>
      ['start', 'enqueue', 'resume'].map((mode) => ({
        graph,
        canonicalId: graph.canonicalId,
        mode,
      })),
    ),
  )(
    'blocks $canonicalId $mode before any execution, queue, or provider work',
    async ({ graph, mode }) => {
      const assertAccess = vi
        .fn()
        .mockRejectedValue(
          new ForbiddenException('Clips disabled or unavailable'),
        );
      const queueSystemWorkflow = vi.fn();
      const createExecution = vi.fn();
      const { runner } = createRunner(
        { queueSystemWorkflow },
        {},
        {},
        { createExecution },
        { assertAccess },
      );
      runner.registerWorkflow(graph);
      const internals = runner as unknown as RunnerInternals;
      const resolve = vi.spyOn(internals, 'resolveUserId');
      const mirror = vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror');
      const provider = vi.fn();
      const input = {
        canonicalId: graph.canonicalId,
        actionType: graph.canonicalId,
        organizationId: 'org-1',
        userId: 'user-1',
        source: 'legacy-clips',
        metadata: { organizationModule: 'playground' },
      };
      await expect(
        mode === 'start'
          ? runner.startWorkflow(input)
          : mode === 'enqueue'
            ? runner.enqueueWorkflow(input, {
                dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
              })
            : runner.runWithRegisteredWorkflowModule(input, provider),
      ).rejects.toThrow('Clips disabled or unavailable');
      expect(assertAccess).toHaveBeenCalledWith('org-1', 'clips');
      expect(resolve).not.toHaveBeenCalled();
      expect(mirror).not.toHaveBeenCalled();
      expect(createExecution).not.toHaveBeenCalled();
      expect(queueSystemWorkflow).not.toHaveBeenCalled();
      expect(provider).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      graph: buildClipGenerationChildWorkflowDefinition(),
      nodeId: 'finalize-child',
      allowed: false,
    },
    {
      graph: buildClipContinuityWorkflowDefinition(),
      nodeId: 'persist-continuity-report',
      allowed: true,
    },
  ])(
    '$graph.canonicalId $nodeId respects fresh access after revocation',
    async ({ graph, nodeId, allowed }) => {
      const assertAccess = vi.fn().mockResolvedValue(undefined);
      const { runner, executors } = createRunner(
        undefined,
        {},
        {},
        {},
        { assertAccess },
      );
      runner.registerWorkflow(graph);
      const node = graph.definition.nodes.find((value) => value.id === nodeId);
      if (!node) throw new Error('registered clip node missing');
      const actionId = String(node.data.config.actionId);
      const work = vi.fn().mockResolvedValue({ completed: true });
      runner.registerAction(actionId, work);
      await runner.runWithRegisteredWorkflowModule(
        { canonicalId: graph.canonicalId, organizationId: 'org-1' },
        async () => {
          assertAccess.mockRejectedValue(
            new ForbiddenException('Clips revoked'),
          );
          const result = executors.get(actionId)?.(
            {
              config: { actionId },
              id: nodeId,
              inputs: [],
              label: nodeId,
              type: 'genfeedAction',
            },
            new Map(),
            executionContext(),
          );
          if (allowed)
            await expect(result).resolves.toEqual({ completed: true });
          else await expect(result).rejects.toThrow('Clips revoked');
        },
      );
      expect(work).toHaveBeenCalledTimes(allowed ? 1 : 0);
      expect(assertAccess).toHaveBeenCalledTimes(allowed ? 1 : 2);
    },
  );
});

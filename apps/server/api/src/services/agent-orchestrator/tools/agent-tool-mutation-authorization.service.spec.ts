import { runWithActionOrigin } from '@api/action-origin/action-origin.context';
import { AGENT_RUNTIME_WORKFLOW_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentToolMutationAuthorizationService } from '@api/services/agent-orchestrator/tools/agent-tool-mutation-authorization.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActionOrigin, AgentAutonomyMode } from '@genfeedai/contracts';
import { type Prisma, WorkflowExecutionStatus } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

describe('AgentToolMutationAuthorizationService trusted mode', () => {
  it('requires a stored pending approval id and returns a zero-credit confirmation card', async () => {
    const createPending = vi
      .fn()
      .mockResolvedValue({ id: 'pending-id', status: 'PENDING' });
    const service = new AgentToolMutationAuthorizationService(
      {} as never,
      {
        createPending,
        findActiveByIdempotencyKey: vi.fn().mockResolvedValue(null),
      } as never,
    );
    const result = await service.authorize(
      'capture_memory',
      { content: 'Remember this' },
      {
        organizationId: 'org',
        userId: 'user',
        threadId: 'thread',
        hostSupportsApproval: true,
      },
      {} as never,
    );
    expect(result).toMatchObject({
      kind: 'return',
      result: {
        approvalId: 'pending-id',
        approvalStatus: 'pending',
        creditsUsed: 0,
        requiresConfirmation: true,
        nextActions: [
          expect.objectContaining({ type: 'mutation_approval_card' }),
        ],
      },
    });
    createPending.mockResolvedValue(undefined);
    await expect(
      service.authorize(
        'capture_memory',
        { content: 'Remember this' },
        {
          organizationId: 'org',
          userId: 'user',
          threadId: 'thread',
          hostSupportsApproval: true,
        },
        {} as never,
      ),
    ).rejects.toThrow('pending approval id');
  });
  const context = {
    organizationId: 'org',
    userId: 'user',
    agentMode: 'auto' as const,
  };
  it('ignores caller mode without a thread', async () => {
    const service = new AgentToolMutationAuthorizationService({} as never);
    expect(await service.resolveAgentModeForContext(context)).toBeUndefined();
    expect(
      await service.resolveAgentModeForContext({
        ...context,
        threadId: 'thread',
      }),
    ).toBe('manual');
  });
  it.each([
    null,
    { mode: 'broken' },
    { mode: 'manual' },
    { mode: 'plan' },
    { mode: 'auto' },
  ])('uses owned persisted mode or fails closed: %j', async (thread) => {
    const findOne = vi.fn().mockResolvedValue(thread);
    const service = new AgentToolMutationAuthorizationService(
      {} as never,
      undefined,
      { findOne } as never,
    );
    expect(
      await service.resolveAgentModeForContext({
        ...context,
        threadId: 'thread',
      }),
    ).toBe(
      thread?.mode === 'plan' || thread?.mode === 'auto'
        ? thread.mode
        : 'manual',
    );
    expect(findOne).toHaveBeenCalledWith({
      id: 'thread',
      organizationId: 'org',
      userId: 'user',
      isDeleted: false,
    });
  });
  it('rejects storage errors without executing', async () => {
    const service = new AgentToolMutationAuthorizationService(
      {} as never,
      undefined,
      { findOne: vi.fn().mockRejectedValue(new Error('offline')) } as never,
    );
    await expect(
      service.resolveAgentModeForContext({ ...context, threadId: 'thread' }),
    ).rejects.toThrow('offline');
  });
});

function proactiveAuthorizationFixture() {
  const context: ToolExecutionContext = {
    organizationId: 'org',
    userId: 'user',
    threadId: 'thread',
    brandId: 'brand',
    runId: 'run',
    strategyId: 'strategy',
    isProactive: true,
    autonomyMode: AgentAutonomyMode.SUPERVISED,
    hostSupportsApproval: true,
    validatedScope: {
      organizationId: 'org',
      userId: 'user',
      threadId: 'thread',
      brandId: 'brand',
      contextVersion: 1,
      isLegacyFallback: false,
      isVersionExplicit: true,
      source: 'explicit',
    },
  };
  const data = {
    execution: {
      workflowId: 'mirror',
      workflowVersionId: 'version',
      workflow: {
        id: 'mirror',
        isDeleted: false,
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        metadata: {
          sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
          systemWorkflow: buildHiddenSystemWorkflowMetadata({
            canonicalId: AGENT_RUNTIME_WORKFLOW_IDS.TURN,
          }),
        },
      },
      workflowVersion: {
        workflowId: 'mirror',
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      },
      result: {
        inputValues: {
          request: {
            source: 'proactive',
            strategyId: 'strategy',
            threadId: 'thread',
            brandId: 'brand',
            autonomyMode: 'SUPERVISED',
            creditBudget: 100,
          },
        },
        metadata: {
          source: 'proactive',
          strategyId: 'strategy',
          threadId: 'thread',
          brandId: 'brand',
          actionType: String(AGENT_RUNTIME_WORKFLOW_IDS.TURN),
          canonicalId: String(AGENT_RUNTIME_WORKFLOW_IDS.TURN),
          isSystemAction: true,
        },
      },
    },
    thread: {
      agentStrategyId: 'strategy',
      brandId: 'brand',
      contextVersion: 1,
      mode: 'manual',
      status: 'active',
    },
    strategy: { config: { autonomyMode: 'SUPERVISED', isEnabled: true } },
  };
  const tx = {
    workflowExecution: {
      findFirst: vi.fn(
        async (): Promise<typeof data.execution | null> => data.execution,
      ),
    },
    agentThread: {
      findFirst: vi.fn(
        async (): Promise<typeof data.thread | null> => data.thread,
      ),
    },
    agentStrategy: {
      findFirst: vi.fn(
        async (): Promise<typeof data.strategy | null> => data.strategy,
      ),
    },
  };
  const transaction = vi.fn(
    async (callback: (client: Prisma.TransactionClient) => Promise<boolean>) =>
      callback(tx as unknown as Prisma.TransactionClient),
  );
  const approvals = {
    createPending: vi
      .fn()
      .mockResolvedValue({ id: 'pending', status: 'PENDING' }),
    findActiveByIdempotencyKey: vi.fn().mockResolvedValue(null),
  };
  const preparePost = vi.fn().mockResolvedValue({
    success: true,
    requiresConfirmation: true,
    creditsUsed: 0,
  });
  const service = new AgentToolMutationAuthorizationService(
    {} as LoggerService,
    approvals as unknown as ConstructorParameters<
      typeof AgentToolMutationAuthorizationService
    >[1],
    {
      findOne: vi.fn().mockImplementation(async () => data.thread),
    } as unknown as ConstructorParameters<
      typeof AgentToolMutationAuthorizationService
    >[2],
    { $transaction: transaction } as unknown as PrismaService,
  );
  const authorize = (
    parameters: Record<string, unknown> = {
      content: 'Text draft',
      platforms: ['linkedin'],
    },
    origin = ActionOrigin.AGENT,
  ) =>
    runWithActionOrigin({ origin }, () =>
      service.authorize('create_post', parameters, context, {
        publishHandler: { preparePost } as unknown as Parameters<
          typeof service.authorize
        >[3]['publishHandler'],
        prepareHandler: {} as Parameters<
          typeof service.authorize
        >[3]['prepareHandler'],
        routeRewriteService: {
          scopeToolResultHrefs: async (result) => result,
        } as Parameters<typeof service.authorize>[3]['routeRewriteService'],
        dispatchPreview: vi.fn(),
      }),
    );
  return {
    data,
    context,
    tx,
    transaction,
    approvals,
    preparePost,
    service,
    authorize,
  };
}

describe('persisted supervised proactive text-draft authorization', () => {
  it.each(['manual', 'auto'])(
    'issues a draft-only constraint for a trusted %s thread without an approval',
    async (mode) => {
      const f = proactiveAuthorizationFixture();
      f.data.thread.mode = mode;
      expect(await f.authorize()).toEqual({
        kind: 'execute',
        constraint: 'proactive-text-draft-only',
      });
      expect(f.approvals.createPending).not.toHaveBeenCalled();
      expect(f.preparePost).not.toHaveBeenCalled();
      expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
      });
      expect(f.tx.workflowExecution.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'run',
            organizationId: 'org',
            userId: 'user',
            isDeleted: false,
            status: WorkflowExecutionStatus.RUNNING,
          },
        }),
      );
      expect(f.tx.agentThread.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'thread',
            organizationId: 'org',
            userId: 'user',
            isDeleted: false,
          },
        }),
      );
      expect(f.tx.agentStrategy.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'strategy',
            organizationId: 'org',
            userId: 'user',
            brandId: 'brand',
            isDeleted: false,
            isActive: true,
            organization: { isDeleted: false },
            brand: { organizationId: 'org', isDeleted: false },
          }),
        }),
      );
    },
  );

  const corruptions: Array<
    [string, (f: ReturnType<typeof proactiveAuthorizationFixture>) => void]
  > = [
    [
      'scope organization',
      (f) => {
        if (f.context.validatedScope)
          f.context.validatedScope.organizationId = 'foreign';
      },
    ],
    [
      'scope user',
      (f) => {
        if (f.context.validatedScope)
          f.context.validatedScope.userId = 'foreign';
      },
    ],
    [
      'scope thread',
      (f) => {
        if (f.context.validatedScope)
          f.context.validatedScope.threadId = 'foreign';
      },
    ],
    [
      'context brand',
      (f) => {
        f.context.brandId = 'foreign';
      },
    ],
    [
      'missing run',
      (f) => {
        delete f.context.runId;
      },
    ],
    [
      'missing strategy',
      (f) => {
        delete f.context.strategyId;
      },
    ],
    [
      'missing brand',
      (f) => {
        if (f.context.validatedScope) delete f.context.validatedScope.brandId;
      },
    ],
    [
      'missing execution',
      (f) => {
        f.tx.workflowExecution.findFirst.mockResolvedValue(null);
      },
    ],
    [
      'terminal execution',
      (f) => {
        f.tx.workflowExecution.findFirst.mockResolvedValue(null);
      },
    ],
    [
      'paused or deleted strategy',
      (f) => {
        f.tx.agentStrategy.findFirst.mockResolvedValue(null);
      },
    ],
    [
      'missing thread',
      (f) => {
        f.tx.agentThread.findFirst.mockResolvedValue(null);
      },
    ],
    [
      'disabled config',
      (f) => {
        f.data.strategy.config.isEnabled = false;
      },
    ],
    [
      'permissive config',
      (f) => {
        f.data.strategy.config.autonomyMode = 'AUTO_PUBLISH';
      },
    ],
    [
      'invalid config',
      (f) => {
        f.data.strategy.config.autonomyMode = 'corrupt';
      },
    ],
    [
      'Plan mode',
      (f) => {
        f.data.thread.mode = 'plan';
      },
    ],
    [
      'invalid mode',
      (f) => {
        f.data.thread.mode = 'corrupt';
      },
    ],
    [
      'archived thread',
      (f) => {
        f.data.thread.status = 'archived';
      },
    ],
    [
      'thread strategy',
      (f) => {
        f.data.thread.agentStrategyId = 'foreign';
      },
    ],
    [
      'thread brand',
      (f) => {
        f.data.thread.brandId = 'foreign';
      },
    ],
    [
      'scope version',
      (f) => {
        f.data.thread.contextVersion = 2;
      },
    ],
    [
      'request source',
      (f) => {
        f.data.execution.result.inputValues.request.source = 'conversation';
      },
    ],
    [
      'request strategy',
      (f) => {
        f.data.execution.result.inputValues.request.strategyId = 'foreign';
      },
    ],
    [
      'request thread',
      (f) => {
        f.data.execution.result.inputValues.request.threadId = 'foreign';
      },
    ],
    [
      'request brand',
      (f) => {
        f.data.execution.result.inputValues.request.brandId = 'foreign';
      },
    ],
    [
      'request autonomy',
      (f) => {
        f.data.execution.result.inputValues.request.autonomyMode =
          'AUTO_PUBLISH';
      },
    ],
    [
      'exhausted request',
      (f) => {
        f.data.execution.result.inputValues.request.creditBudget = 0;
      },
    ],
    [
      'nonfinite request budget',
      (f) => {
        f.data.execution.result.inputValues.request.creditBudget = Number.NaN;
      },
    ],
    [
      'metadata action type',
      (f) => {
        f.data.execution.result.metadata.actionType = 'other';
      },
    ],
    [
      'wrong mirror canonical identity',
      (f) => {
        f.data.execution.workflow.metadata.systemWorkflow.canonicalId = 'other';
      },
    ],
    [
      'mirror visible to an organization',
      (f) => {
        f.data.execution.workflow.metadata.systemWorkflow.visibility =
          'organization';
      },
    ],
    [
      'tenant-created mirror user',
      (f) => {
        f.data.execution.workflow.userId = 'user';
      },
    ],
    [
      'foreign pinned version organization',
      (f) => {
        f.data.execution.workflowVersion.organizationId = 'foreign';
      },
    ],
    [
      'metadata source',
      (f) => {
        f.data.execution.result.metadata.source = 'campaign';
      },
    ],
    [
      'metadata strategy',
      (f) => {
        f.data.execution.result.metadata.strategyId = 'foreign';
      },
    ],
    [
      'metadata thread',
      (f) => {
        f.data.execution.result.metadata.threadId = 'foreign';
      },
    ],
    [
      'metadata brand',
      (f) => {
        f.data.execution.result.metadata.brandId = 'foreign';
      },
    ],
    [
      'metadata canonical action',
      (f) => {
        f.data.execution.result.metadata.canonicalId = 'other';
      },
    ],
    [
      'not a system action',
      (f) => {
        f.data.execution.result.metadata.isSystemAction = false;
      },
    ],
    [
      'tenant-created mirror',
      (f) => {
        f.data.execution.workflow.organizationId = 'org';
      },
    ],
    [
      'deleted mirror',
      (f) => {
        f.data.execution.workflow.isDeleted = true;
      },
    ],
    [
      'wrong pinned version',
      (f) => {
        f.data.execution.workflowVersion.workflowId = 'other';
      },
    ],
    [
      'foreign pinned version',
      (f) => {
        f.data.execution.workflowVersion.userId = 'foreign';
      },
    ],
  ];
  it.each(corruptions)(
    'fails closed for %s rather than creating an approval',
    async (_name, corrupt) => {
      const f = proactiveAuthorizationFixture();
      corrupt(f);
      expect(await f.authorize()).toMatchObject({
        kind: 'return',
        result: { success: false, creditsUsed: 0 },
      });
      expect(f.approvals.createPending).not.toHaveBeenCalled();
      expect(f.preparePost).not.toHaveBeenCalled();
    },
  );

  it('propagates candidate database failure without granting or creating approval', async () => {
    const f = proactiveAuthorizationFixture();
    f.transaction.mockRejectedValue(new Error('database unavailable'));
    await expect(f.authorize()).rejects.toThrow('database unavailable');
    expect(f.approvals.createPending).not.toHaveBeenCalled();
  });
  it('accepts the persisted legacy spelling of supervised without accepting a permissive mode', async () => {
    const f = proactiveAuthorizationFixture();
    f.data.strategy.config.autonomyMode = 'supervised';
    expect(await f.authorize()).toEqual({
      kind: 'execute',
      constraint: 'proactive-text-draft-only',
    });
  });
  it('rejects a candidate when the optional Prisma provider is unavailable', async () => {
    const f = proactiveAuthorizationFixture();
    const service = new AgentToolMutationAuthorizationService(
      {} as LoggerService,
    );
    await expect(
      runWithActionOrigin({ origin: ActionOrigin.AGENT }, () =>
        service.authorize(
          'create_post',
          { content: 'Draft' },
          f.context,
          {} as Parameters<typeof service.authorize>[3],
        ),
      ),
    ).rejects.toThrow('authorization storage is unavailable');
  });

  it('requires persisted envelope objects rather than truthy malformed input', async () => {
    const f = proactiveAuthorizationFixture();
    f.tx.workflowExecution.findFirst.mockResolvedValue({
      ...f.data.execution,
      result: { ...f.data.execution.result, metadata: null },
    } as unknown as typeof f.data.execution);
    expect(await f.authorize()).toMatchObject({
      kind: 'return',
      result: { success: false },
    });
    expect(f.approvals.createPending).not.toHaveBeenCalled();
  });

  it('preserves the ordinary approval path when the context is not proactive', async () => {
    const f = proactiveAuthorizationFixture();
    f.context.isProactive = false;
    expect(await f.authorize()).toMatchObject({
      kind: 'return',
      result: { requiresConfirmation: true },
    });
    expect(f.transaction).not.toHaveBeenCalled();
    expect(f.approvals.createPending).toHaveBeenCalledOnce();
  });
  it.each(['contentId', 'ingredientId'])(
    'preserves the specialized publishing preview for %s',
    async (key) => {
      const f = proactiveAuthorizationFixture();
      expect(
        await f.authorize({ [key]: 'content', platforms: ['linkedin'] }),
      ).toMatchObject({
        kind: 'return',
        result: { requiresConfirmation: true },
      });
      expect(f.transaction).not.toHaveBeenCalled();
      expect(f.preparePost).toHaveBeenCalledOnce();
    },
  );
  it.each([ActionOrigin.MCP, ActionOrigin.API, ActionOrigin.CLI])(
    'does not issue a proactive exception on %s',
    async (origin) => {
      const f = proactiveAuthorizationFixture();
      const decision = await f.authorize(undefined, origin);
      expect(decision.kind).toBe('return');
      expect(f.transaction).not.toHaveBeenCalled();
      expect(f.approvals.createPending).toHaveBeenCalledOnce();
    },
  );
});

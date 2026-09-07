import 'reflect-metadata';
import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';
import {
  AgentToolExecutorService,
  type ToolExecutionContext,
} from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  buildLogicalWriteKey,
  UNSUPPORTED_APPROVAL_ERROR,
} from '@genfeedai/actions';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createWorkflowRunner() {
  const executors = new Map<string, SystemWorkflowActionExecutor>();
  const workflows = new Set<string>();
  return {
    registerAction: vi.fn(
      (actionId: string, executor: SystemWorkflowActionExecutor) => {
        executors.set(actionId, executor);
      },
    ),
    registerWorkflow: vi.fn((definition: { canonicalId: string }) => {
      workflows.add(definition.canonicalId);
    }),
    runWorkflow: vi.fn(
      async (request: {
        actionType: string;
        canonicalId: string;
        inputValues?: Record<string, unknown>;
        organizationId: string;
        runtimeContext?: unknown;
        userId?: string;
      }) => {
        if (!workflows.has(request.canonicalId)) {
          throw new Error(`Missing test workflow ${request.canonicalId}`);
        }
        const executor = executors.get(request.actionType);
        if (!executor) {
          throw new Error(`Missing test action ${request.actionType}`);
        }
        const result = await executor({
          context: {
            organizationId: request.organizationId,
            runId: 'run-1',
            userId: request.userId ?? testId('user'),
            workflowId: 'workflow-1',
            workflowVersionId: 'workflow-version-1',
          },
          input:
            request.inputValues?.parameters &&
            typeof request.inputValues.parameters === 'object' &&
            !Array.isArray(request.inputValues.parameters)
              ? (request.inputValues.parameters as Record<string, unknown>)
              : {},
          provenance: {
            executionId: 'execution-1',
            workflowId: 'workflow-1',
            workflowLabel: request.canonicalId,
          },
          runtimeContext: request.runtimeContext,
        });
        return { provenance: { executionId: 'execution-1' }, result };
      },
    ),
  };
}

describe('AgentToolExecutorService mutation policy', () => {
  const logger = { error: vi.fn(), log: vi.fn() };
  const publishHandler = {
    createPost: vi.fn(),
    schedulePost: vi.fn(),
    handles: vi.fn(() => false),
    execute: vi.fn(),
  };
  const workspaceHandler = { getCreditsBalance: vi.fn() };
  const instagramHandler = {
    handles: vi.fn(() => false),
    execute: vi.fn(),
  };
  const xActionsHandler = {
    handles: vi.fn(() => false),
    execute: vi.fn(),
  };

  let mcpApprovals: {
    attachResult: ReturnType<typeof vi.fn>;
    claimExecution: ReturnType<typeof vi.fn>;
    createPending: ReturnType<typeof vi.fn>;
    findActiveByIdempotencyKey: ReturnType<typeof vi.fn>;
    findOwned: ReturnType<typeof vi.fn>;
    resolve: ReturnType<typeof vi.fn>;
  };
  let service: AgentToolExecutorService;

  beforeEach(() => {
    vi.clearAllMocks();
    mcpApprovals = {
      attachResult: vi.fn(),
      claimExecution: vi.fn().mockResolvedValue(true),
      createPending: vi.fn().mockResolvedValue({
        id: 'apr-1',
        status: 'PENDING',
        toolName: 'create_post',
      }),
      findActiveByIdempotencyKey: vi.fn().mockResolvedValue(null),
      findOwned: vi.fn(),
      resolve: vi.fn(),
    };
    const workflowRunner = createWorkflowRunner();
    const unused = {} as never;
    service = new AgentToolExecutorService(
      logger as unknown as LoggerService,
      { scopeToolResultHrefs: vi.fn(async (result) => result) } as never,
      unused,
      unused,
      publishHandler as never,
      unused,
      unused,
      instagramHandler as never,
      xActionsHandler as never,
      unused,
      workspaceHandler as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      { assertConsequentialBoundary: vi.fn() } as never,
      undefined,
      workflowRunner as never,
      mcpApprovals as never,
    );
    service.onModuleInit();
  });

  const context = (
    overrides: Partial<ToolExecutionContext> = {},
  ): ToolExecutionContext => ({
    organizationId: testId('org'),
    userId: testId('user'),
    ...(overrides.threadId
      ? {
          validatedScope: {
            threadId: overrides.threadId,
            brandId: 'brand-1',
            contextVersion: 1,
          } as ToolExecutionContext['validatedScope'],
        }
      : {}),
    ...overrides,
  });

  it('rejects approval-required tools on a host with no approval mechanism', async () => {
    const result = await service.executeTool(
      'create_post',
      { content: 'hello' },
      context({ hostSupportsApproval: false }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(UNSUPPORTED_APPROVAL_ERROR);
    expect(publishHandler.createPost).not.toHaveBeenCalled();
    expect(mcpApprovals.createPending).not.toHaveBeenCalled();
  });

  it('rejects approval-required tools when host capability is omitted', async () => {
    const result = await service.executeTool(
      'create_post',
      { content: 'hello' },
      context(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(UNSUPPORTED_APPROVAL_ERROR);
    expect(publishHandler.createPost).not.toHaveBeenCalled();
    expect(mcpApprovals.createPending).not.toHaveBeenCalled();
  });

  it.each(['schedule_post', 'get_credits_balance'] as const)(
    'executes %s without approval lookups when host capability is omitted',
    async (toolName) => {
      const handler =
        toolName === 'schedule_post'
          ? publishHandler.schedulePost
          : workspaceHandler.getCreditsBalance;
      handler.mockResolvedValue({ creditsUsed: 0, success: true });
      mcpApprovals.findActiveByIdempotencyKey.mockRejectedValue(
        new Error('Approval storage unavailable'),
      );

      const result = await service.executeTool(toolName, {}, context());

      expect(result.success).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(mcpApprovals.findActiveByIdempotencyKey).not.toHaveBeenCalled();
      expect(mcpApprovals.createPending).not.toHaveBeenCalled();
    },
  );

  it('rejects a mismatched approval id even for a direct action', async () => {
    mcpApprovals.findOwned.mockResolvedValue({
      id: 'apr-1',
      arguments: { content: 'approved' },
      isDeleted: false,
      status: 'APPROVED',
      userId: testId('user'),
      toolName: 'create_post',
    });

    const result = await service.executeTool(
      'schedule_post',
      { content: 'approved' },
      context({ approvedApprovalId: 'apr-1' }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Approval does not authorize this exact tool invocation',
    );
    expect(mcpApprovals.findOwned).toHaveBeenCalledWith('apr-1', testId('org'));
    expect(publishHandler.schedulePost).not.toHaveBeenCalled();
  });

  it('fails clearly when an approval host has no approval storage', async () => {
    Reflect.set(service, 'mcpApprovalsService', undefined);
    const result = await service.executeTool(
      'create_post',
      { content: 'hello' },
      context({ hostSupportsApproval: true }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Approval service unavailable');
    expect(result.requiresConfirmation).not.toBe(true);
    expect(publishHandler.createPost).not.toHaveBeenCalled();
  });

  it('persists a pending call and does not execute on an approval host', async () => {
    const result = await service.executeTool(
      'create_post',
      { content: 'hello' },
      context({ hostSupportsApproval: true, threadId: testId('thread') }),
    );

    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.approvalStatus).toBe('pending');
    expect(result.approvalId).toBe('apr-1');
    expect(mcpApprovals.createPending).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'create_post',
      { content: 'hello' },
      {
        threadId: expect.any(String),
        scope: expect.objectContaining({
          brandId: 'brand-1',
          contextVersion: 1,
        }),
      },
    );
    expect(publishHandler.createPost).not.toHaveBeenCalled();
  });

  it.each([true, undefined])(
    'executes a trusted approval once and replays with host capability %s',
    async (hostSupportsApproval) => {
      publishHandler.createPost.mockResolvedValue({
        creditsUsed: 0,
        data: { id: 'post-1' },
        success: true,
      });

      const first = await service.executeTool(
        'create_post',
        { content: 'hello' },
        context({
          confirmationOrigin: 'thread-ui-action',
          hostSupportsApproval,
        }),
      );
      expect(first.success).toBe(true);
      expect(publishHandler.createPost).toHaveBeenCalledTimes(1);

      mcpApprovals.findActiveByIdempotencyKey.mockResolvedValue({
        id: 'apr-1',
        result: { creditsUsed: 0, data: { id: 'post-1' }, success: true },
        status: 'APPROVED',
        toolName: 'create_post',
      });
      publishHandler.createPost.mockClear();

      const retry = await service.executeTool(
        'create_post',
        { content: 'hello' },
        context({
          confirmationOrigin: 'thread-ui-action',
          hostSupportsApproval,
        }),
      );
      expect(retry.success).toBe(true);
      expect(retry.data).toEqual({ id: 'post-1' });
      expect(publishHandler.createPost).not.toHaveBeenCalled();
    },
  );
  it('rejects changed arguments under an approved action id', async () => {
    mcpApprovals.findOwned.mockResolvedValue({
      id: 'apr-1',
      arguments: { content: 'approved' },
      isDeleted: false,
      status: 'APPROVED',
      userId: testId('user'),
      toolName: 'create_post',
      idempotencyKey: buildLogicalWriteKey({
        arguments: { content: 'approved' },
        organizationId: testId('org'),
        userId: testId('user'),
        toolName: 'create_post',
      }),
    });
    const result = await service.executeTool(
      'create_post',
      { content: 'changed' },
      context({ approvedApprovalId: 'apr-1', hostSupportsApproval: true }),
    );
    expect(result.success).toBe(false);
    expect(publishHandler.createPost).not.toHaveBeenCalled();
    expect(mcpApprovals.createPending).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'replays the persisted result envelope with success=%s',
    async (success) => {
      mcpApprovals.findActiveByIdempotencyKey.mockResolvedValue({
        id: 'apr-1',
        status: 'APPROVED',
        toolName: 'create_post',
        result: {
          creditsUsed: 7,
          data: { id: 'post-1' },
          success,
          ...(!success ? { error: 'Provider failed' } : {}),
        },
      });
      const result = await service.executeTool(
        'create_post',
        { content: 'hello' },
        context({ hostSupportsApproval: true }),
      );
      expect(result).toMatchObject({
        success,
        creditsUsed: 0,
        data: { id: 'post-1' },
      });
      if (!success) expect(result.error).toBe('Provider failed');
      expect(publishHandler.createPost).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      userId: testId('requester'),
      storedThread: undefined,
      requestedThread: undefined,
      allowed: true,
    },
    {
      userId: testId('requester'),
      storedThread: 'requester-thread',
      requestedThread: 'requester-thread',
      allowed: true,
    },
    {
      userId: testId('reviewer'),
      storedThread: undefined,
      requestedThread: undefined,
      allowed: false,
    },
    {
      userId: testId('requester'),
      storedThread: 'requester-thread',
      requestedThread: undefined,
      allowed: false,
    },
    {
      userId: testId('requester'),
      storedThread: 'requester-thread',
      requestedThread: 'other-thread',
      allowed: false,
    },
  ])(
    'binds explicit redemption to stored user and thread: %j',
    async ({ userId, storedThread, requestedThread, allowed }) => {
      mcpApprovals.findOwned.mockResolvedValue({
        id: 'apr-1',
        arguments: { content: 'hello' },
        isDeleted: false,
        status: 'APPROVED',
        userId: testId('requester'),
        toolName: 'create_post',
        idempotencyKey: buildLogicalWriteKey({
          arguments: { content: 'hello' },
          organizationId: testId('org'),
          userId: testId('requester'),
          threadId: storedThread,
          ...(storedThread
            ? { scope: { brandId: 'brand-1', contextVersion: 1 } }
            : {}),
          toolName: 'create_post',
        }),
      });
      publishHandler.createPost.mockResolvedValue({
        success: true,
        creditsUsed: 0,
        data: { id: 'post-1' },
      });
      const result = await service.executeTool(
        'create_post',
        { content: 'hello' },
        context({
          approvedApprovalId: 'apr-1',
          hostSupportsApproval: true,
          userId,
          threadId: requestedThread,
        }),
      );
      expect(result.success).toBe(allowed);
      if (allowed) {
        expect(mcpApprovals.claimExecution).toHaveBeenCalledTimes(1);
        expect(publishHandler.createPost).toHaveBeenCalledTimes(1);
      } else {
        expect(result.error).toContain('does not authorize');
        expect(mcpApprovals.claimExecution).not.toHaveBeenCalled();
        expect(publishHandler.createPost).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    { storedThread: undefined, storedScope: undefined, allowed: true },
    {
      storedThread: 'requester-thread',
      storedScope: undefined,
      allowed: false,
    },
    {
      storedThread: undefined,
      storedScope: { brandId: 'brand-1', contextVersion: 1 },
      allowed: false,
    },
    {
      storedThread: 'requester-thread',
      storedScope: { brandId: 'brand-1', contextVersion: 1 },
      allowed: false,
    },
  ])(
    'allows a server-authorized reviewer only for stored threadless, scopeless intent %j',
    async ({ storedThread, storedScope, allowed }) => {
      mcpApprovals.findOwned.mockResolvedValue({
        id: 'apr-1',
        arguments: { content: 'hello' },
        isDeleted: false,
        status: 'APPROVED',
        userId: testId('requester'),
        toolName: 'create_post',
        idempotencyKey: buildLogicalWriteKey({
          arguments: { content: 'hello' },
          organizationId: testId('org'),
          userId: testId('requester'),
          threadId: storedThread,
          scope: storedScope,
          toolName: 'create_post',
        }),
      });
      publishHandler.createPost.mockResolvedValue({
        success: true,
        creditsUsed: 0,
        data: { id: 'post-1' },
      });
      const result = await service.executeTool(
        'create_post',
        { content: 'hello' },
        context({
          approvedApprovalId: 'apr-1',
          approvalReviewerAuthorized: true,
          userId: testId('reviewer'),
        }),
      );
      expect(result.success).toBe(allowed);
      if (allowed) {
        expect(mcpApprovals.claimExecution).toHaveBeenCalledWith(
          'apr-1',
          testId('org'),
        );
        expect(publishHandler.createPost).toHaveBeenCalledTimes(1);
      } else {
        expect(result.error).toContain('does not authorize');
        expect(mcpApprovals.claimExecution).not.toHaveBeenCalled();
        expect(publishHandler.createPost).not.toHaveBeenCalled();
      }
    },
  );

  it('does not dispatch when another request already claimed execution', async () => {
    mcpApprovals.claimExecution.mockResolvedValue(false);
    const result = await service.executeTool(
      'create_post',
      { content: 'hello' },
      context({
        confirmationOrigin: 'thread-ui-action',
        hostSupportsApproval: true,
      }),
    );
    expect(result.success).toBe(false);
    expect(publishHandler.createPost).not.toHaveBeenCalled();
    expect(mcpApprovals.attachResult).not.toHaveBeenCalled();
  });

  it('retries persistence with the successful outcome without dispatching again', async () => {
    const outcome = { success: true, creditsUsed: 0, data: { id: 'post-1' } };
    publishHandler.createPost.mockResolvedValue(outcome);
    mcpApprovals.attachResult.mockRejectedValueOnce(
      new Error('Storage unavailable'),
    );

    const result = await service.executeTool(
      'create_post',
      { content: 'hello' },
      context({
        confirmationOrigin: 'thread-ui-action',
        hostSupportsApproval: true,
      }),
    );

    expect(result).toEqual(outcome);
    expect(publishHandler.createPost).toHaveBeenCalledTimes(1);
    expect(mcpApprovals.attachResult).toHaveBeenCalledTimes(2);
    for (const call of mcpApprovals.attachResult.mock.calls) {
      expect(call).toEqual(['apr-1', testId('org'), outcome]);
    }
  });

  it('retains the claim after terminal persistence failure and rejects replay', async () => {
    const outcome = { success: true, creditsUsed: 0, data: { id: 'post-1' } };
    publishHandler.createPost.mockResolvedValue(outcome);
    mcpApprovals.attachResult.mockRejectedValue(
      new Error('Storage unavailable'),
    );
    let claimed = false;
    mcpApprovals.claimExecution.mockImplementation(async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    });
    mcpApprovals.findActiveByIdempotencyKey.mockImplementation(async () =>
      claimed
        ? {
            id: 'apr-1',
            status: 'APPROVED',
            result: null,
            toolName: 'create_post',
          }
        : null,
    );
    const invocationContext = context({
      confirmationOrigin: 'thread-ui-action',
      hostSupportsApproval: true,
    });

    const first = await service.executeTool(
      'create_post',
      { content: 'hello' },
      invocationContext,
    );
    const retry = await service.executeTool(
      'create_post',
      { content: 'hello' },
      invocationContext,
    );

    expect(first.success).toBe(false);
    expect(mcpApprovals.createPending).toHaveBeenCalledTimes(1);
    expect(mcpApprovals.resolve).toHaveBeenCalledTimes(1);
    expect(mcpApprovals.claimExecution).toHaveBeenCalledTimes(2);
    expect(claimed).toBe(true);
    expect(logger.error).toHaveBeenCalledWith(
      `Approved mutation result persistence failed for approval apr-1 in organization ${testId('org')}; outcome reconciliation required`,
      'AgentToolExecutorService',
    );
    expect(retry.error).toContain('awaiting outcome reconciliation');
    expect(publishHandler.createPost).toHaveBeenCalledTimes(1);
    expect(mcpApprovals.attachResult).toHaveBeenCalledTimes(2);
    for (const call of mcpApprovals.attachResult.mock.calls) {
      expect(call).toEqual(['apr-1', testId('org'), outcome]);
    }
  });

  it('retries persistence of a thrown handler failure without executing again', async () => {
    publishHandler.createPost.mockRejectedValueOnce(
      new Error('Provider failed'),
    );
    mcpApprovals.attachResult.mockRejectedValueOnce(
      new Error('Storage unavailable'),
    );

    const result = await service.executeTool(
      'create_post',
      { content: 'hello' },
      context({
        confirmationOrigin: 'thread-ui-action',
        hostSupportsApproval: true,
      }),
    );

    expect(result.error).toBe('Provider failed');
    expect(logger.log).not.toHaveBeenCalled();
    expect(publishHandler.createPost).toHaveBeenCalledTimes(1);
    expect(mcpApprovals.attachResult).toHaveBeenCalledTimes(2);
    for (const call of mcpApprovals.attachResult.mock.calls) {
      expect(call).toEqual(['apr-1', testId('org'), result]);
    }
  });

  it('persists a thrown handler failure on the claimed approval', async () => {
    publishHandler.createPost.mockRejectedValueOnce(
      new Error('Provider failed'),
    );
    const result = await service.executeTool(
      'create_post',
      { content: 'hello' },
      context({
        confirmationOrigin: 'thread-ui-action',
        hostSupportsApproval: true,
      }),
    );
    expect(result.success).toBe(false);
    expect(mcpApprovals.attachResult).toHaveBeenCalledWith(
      'apr-1',
      testId('org'),
      { success: false, error: 'Provider failed', creditsUsed: 0 },
    );
  });
});

import 'reflect-metadata';
import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';
import {
  AgentToolExecutorService,
  type ToolExecutionContext,
} from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentToolMutationAuthorizationService } from '@api/services/agent-orchestrator/tools/agent-tool-mutation-authorization.service';
import { UNSUPPORTED_APPROVAL_ERROR } from '@genfeedai/actions';
import { buildLogicalWriteKey } from '@genfeedai/actions/server';
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
  let membersService: { findOne: ReturnType<typeof vi.fn> };
  let service: AgentToolExecutorService;
  let mutationAuthorizationService: AgentToolMutationAuthorizationService;

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
    const memberRoles: Record<string, string> = {
      [testId('requester')]: 'user',
      [testId('member')]: 'user',
      [testId('org-admin')]: 'admin',
      [testId('org-owner')]: 'owner',
    };
    membersService = {
      findOne: vi.fn(async (query: { userId: string }) =>
        memberRoles[query.userId]
          ? { role: { key: memberRoles[query.userId] } }
          : null,
      ),
    };
    mutationAuthorizationService = new AgentToolMutationAuthorizationService(
      logger as unknown as LoggerService,
      mcpApprovals as never,
      undefined,
      undefined,
      membersService as never,
    );
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
      mutationAuthorizationService,
      { assertConsequentialBoundary: vi.fn() } as never,
      undefined,
      workflowRunner as never,
    );
    Object.assign(service, {
      workObjects: { assertReady: vi.fn().mockResolvedValue(undefined) },
      generationSettingsHandler: { handles: vi.fn().mockReturnValue(false) },
    });
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

  it('discards an injected draft constraint before authorization and dispatch without mutating the caller', async () => {
    const authorize = vi
      .spyOn(mutationAuthorizationService, 'authorize')
      .mockResolvedValue({ kind: 'execute' });
    publishHandler.createPost.mockResolvedValue({
      success: true,
      creditsUsed: 0,
    });
    const caller = context({ proactiveTextDraftOnly: true });
    expect(
      (await service.executeTool('create_post', { content: 'Draft' }, caller))
        .success,
    ).toBe(true);
    expect(authorize.mock.calls[0][2]).not.toHaveProperty(
      'proactiveTextDraftOnly',
    );
    expect(publishHandler.createPost.mock.calls[0][1]).not.toHaveProperty(
      'proactiveTextDraftOnly',
    );
    expect(caller.proactiveTextDraftOnly).toBe(true);
    authorize.mockRestore();
  });

  it('transports only the newly issued draft-only decision through the existing workflow dispatch', async () => {
    const authorize = vi
      .spyOn(mutationAuthorizationService, 'authorize')
      .mockResolvedValue({
        kind: 'execute',
        constraint: 'proactive-text-draft-only',
      });
    publishHandler.createPost.mockResolvedValue({
      success: true,
      creditsUsed: 0,
    });
    const caller = context({
      isProactive: true,
      runId: 'outer-run',
      strategyId: 'strategy',
    });
    const params = { content: 'Draft', platforms: ['linkedin'] };
    expect(
      (await service.executeTool('create_post', params, caller)).success,
    ).toBe(true);
    expect(authorize.mock.calls[0][2]).not.toHaveProperty(
      'proactiveTextDraftOnly',
    );
    expect(publishHandler.createPost).toHaveBeenCalledWith(
      params,
      expect.objectContaining({
        proactiveTextDraftOnly: true,
        runId: 'outer-run',
      }),
    );
    expect(caller).not.toHaveProperty('proactiveTextDraftOnly');
    expect(params).not.toHaveProperty('confirmed');
    expect(mcpApprovals.createPending).not.toHaveBeenCalled();
    authorize.mockRestore();
  });

  it('fails closed when a draft constraint is returned for a different tool', async () => {
    const authorize = vi
      .spyOn(mutationAuthorizationService, 'authorize')
      .mockResolvedValue({
        kind: 'execute',
        constraint: 'proactive-text-draft-only',
      });
    const result = await service.executeTool(
      'get_credits_balance',
      {},
      context(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'Draft-only authorization is limited to create_post',
    );
    expect(workspaceHandler.getCreditsBalance).not.toHaveBeenCalled();
    authorize.mockRestore();
  });

  it('never dispatches after the mocked authorizer returns a failed decision', async () => {
    const authorize = vi
      .spyOn(mutationAuthorizationService, 'authorize')
      .mockResolvedValue({
        kind: 'return',
        result: { success: false, creditsUsed: 0, error: 'Untrusted run' },
      });
    const result = await service.executeTool(
      'create_post',
      { content: 'Draft' },
      context({ proactiveTextDraftOnly: true }),
    );
    expect(result).toEqual({
      success: false,
      creditsUsed: 0,
      error: 'Untrusted run',
    });
    expect(publishHandler.createPost).not.toHaveBeenCalled();
    expect(mcpApprovals.createPending).not.toHaveBeenCalled();
    authorize.mockRestore();
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
    Reflect.set(mutationAuthorizationService, 'mcpApprovalsService', undefined);
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

  describe('organization-admin redemption of an approved write', () => {
    const queued = (overrides: Record<string, unknown> = {}) => ({
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
        toolName: 'create_post',
      }),
      ...overrides,
    });
    const redeem = (overrides: Partial<ToolExecutionContext> = {}) =>
      service.executeTool(
        'create_post',
        { content: 'hello' },
        context({
          approvedApprovalId: 'apr-1',
          hostSupportsApproval: true,
          userId: testId('org-admin'),
          ...overrides,
        }),
      );

    beforeEach(() => {
      publishHandler.createPost.mockResolvedValue({
        success: true,
        creditsUsed: 0,
        data: { id: 'post-1' },
      });
    });

    it.each(['org-admin', 'org-owner'])(
      'executes once as the recorded user when %s redeems',
      async (reviewer) => {
        mcpApprovals.findOwned.mockResolvedValue(queued());
        const result = await redeem({ userId: testId(reviewer) });
        expect(result.success).toBe(true);
        expect(mcpApprovals.claimExecution).toHaveBeenCalledTimes(1);
        expect(publishHandler.createPost).toHaveBeenCalledTimes(1);
        expect(publishHandler.createPost.mock.calls[0][1]).toMatchObject({
          organizationId: testId('org'),
          userId: testId('requester'),
        });
      },
    );

    it('lets the requesting member redeem their own approval as themselves', async () => {
      mcpApprovals.findOwned.mockResolvedValue(queued());
      const result = await redeem({ userId: testId('requester') });
      expect(result.success).toBe(true);
      expect(publishHandler.createPost.mock.calls[0][1]).toMatchObject({
        userId: testId('requester'),
      });
    });

    it('rejects a different non-admin member before claiming anything', async () => {
      mcpApprovals.findOwned.mockResolvedValue(queued());
      const result = await redeem({ userId: testId('member') });
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not authorize');
      expect(mcpApprovals.claimExecution).not.toHaveBeenCalled();
      expect(mcpApprovals.attachResult).not.toHaveBeenCalled();
      expect(publishHandler.createPost).not.toHaveBeenCalled();
    });

    it('rejects a user who is not a member of the organization', async () => {
      mcpApprovals.findOwned.mockResolvedValue(queued());
      const result = await redeem({ userId: testId('outsider') });
      expect(result.success).toBe(false);
      expect(mcpApprovals.claimExecution).not.toHaveBeenCalled();
      expect(publishHandler.createPost).not.toHaveBeenCalled();
    });

    it('does not let an API key without the admin scope act as an org admin', async () => {
      mcpApprovals.findOwned.mockResolvedValue(queued());
      const result = await redeem({
        apiKeyContext: { isApiKey: true, scopes: [] },
      });
      expect(result.success).toBe(false);
      expect(mcpApprovals.claimExecution).not.toHaveBeenCalled();
      expect(publishHandler.createPost).not.toHaveBeenCalled();
    });

    it('rejects when the approval belongs to another organization', async () => {
      mcpApprovals.findOwned.mockRejectedValue(new Error('not found'));
      const result = await redeem();
      expect(result.success).toBe(false);
      expect(mcpApprovals.claimExecution).not.toHaveBeenCalled();
      expect(publishHandler.createPost).not.toHaveBeenCalled();
    });

    it('rejects when the recorded requester is no longer an active member', async () => {
      mcpApprovals.findOwned.mockResolvedValue(
        queued({ userId: testId('former-member') }),
      );
      const result = await redeem();
      expect(result.success).toBe(false);
      expect(result.error).toContain('no longer an active member');
      expect(mcpApprovals.claimExecution).not.toHaveBeenCalled();
      expect(publishHandler.createPost).not.toHaveBeenCalled();
    });

    it('never lets an admin redeem a thread-bound approval', async () => {
      const storedThread = 'requester-thread';
      mcpApprovals.findOwned.mockResolvedValue(
        queued({
          idempotencyKey: buildLogicalWriteKey({
            arguments: { content: 'hello' },
            organizationId: testId('org'),
            userId: testId('requester'),
            threadId: storedThread,
            scope: { brandId: 'brand-1', contextVersion: 1 },
            toolName: 'create_post',
          }),
        }),
      );
      const result = await redeem({ threadId: storedThread });
      expect(result.success).toBe(false);
      expect(mcpApprovals.claimExecution).not.toHaveBeenCalled();
      expect(publishHandler.createPost).not.toHaveBeenCalled();
    });

    it('stays redeemable after an authorization failure, then executes once on retry', async () => {
      mcpApprovals.findOwned.mockResolvedValue(queued());
      const denied = await redeem({ userId: testId('member') });
      expect(denied.success).toBe(false);
      expect(mcpApprovals.claimExecution).not.toHaveBeenCalled();
      expect(mcpApprovals.attachResult).not.toHaveBeenCalled();

      const retried = await redeem();
      expect(retried.success).toBe(true);
      expect(mcpApprovals.claimExecution).toHaveBeenCalledTimes(1);
      expect(publishHandler.createPost).toHaveBeenCalledTimes(1);
    });
  });

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
      'AgentToolMutationAuthorizationService',
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

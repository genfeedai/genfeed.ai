import 'reflect-metadata';
import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';
import {
  AgentToolExecutorService,
  type ToolExecutionContext,
} from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { UNSUPPORTED_APPROVAL_ERROR } from '@genfeedai/actions';
import { AgentToolName } from '@genfeedai/contracts/interfaces';
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
  const publishHandler = {
    createPost: vi.fn(),
    handles: vi.fn(() => false),
    execute: vi.fn(),
  };
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
      createPending: vi.fn().mockResolvedValue({
        id: 'apr-1',
        status: 'PENDING',
        toolName: AgentToolName.CREATE_POST,
      }),
      findActiveByIdempotencyKey: vi.fn().mockResolvedValue(null),
      findOwned: vi.fn(),
      resolve: vi.fn(),
    };
    const workflowRunner = createWorkflowRunner();
    const unused = {} as never;
    service = new AgentToolExecutorService(
      { error: vi.fn(), log: vi.fn() } as unknown as LoggerService,
      { scopeToolResultHrefs: vi.fn(async (result) => result) } as never,
      unused,
      unused,
      publishHandler as never,
      unused,
      unused,
      instagramHandler as never,
      xActionsHandler as never,
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
      unused,
      undefined,
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
    ...overrides,
  });

  it('rejects approval-required tools on a host with no approval mechanism', async () => {
    const result = await service.executeTool(
      AgentToolName.CREATE_POST,
      { content: 'hello' },
      context({ hostSupportsApproval: false }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(UNSUPPORTED_APPROVAL_ERROR);
    expect(publishHandler.createPost).not.toHaveBeenCalled();
    expect(mcpApprovals.createPending).not.toHaveBeenCalled();
  });

  it('persists a pending call and does not execute on an approval host', async () => {
    const result = await service.executeTool(
      AgentToolName.CREATE_POST,
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
      AgentToolName.CREATE_POST,
      { content: 'hello' },
      { threadId: expect.any(String) },
    );
    expect(publishHandler.createPost).not.toHaveBeenCalled();
  });

  it('executes once after a trusted approval and replays later retries', async () => {
    publishHandler.createPost.mockResolvedValue({
      creditsUsed: 0,
      data: { id: 'post-1' },
      success: true,
    });

    const first = await service.executeTool(
      AgentToolName.CREATE_POST,
      { content: 'hello' },
      context({
        confirmationOrigin: 'thread-ui-action',
        hostSupportsApproval: true,
      }),
    );
    expect(first.success).toBe(true);
    expect(publishHandler.createPost).toHaveBeenCalledTimes(1);

    mcpApprovals.findActiveByIdempotencyKey.mockResolvedValue({
      id: 'apr-1',
      result: { id: 'post-1' },
      status: 'APPROVED',
      toolName: AgentToolName.CREATE_POST,
    });
    publishHandler.createPost.mockClear();

    const retry = await service.executeTool(
      AgentToolName.CREATE_POST,
      { content: 'hello' },
      context({
        confirmationOrigin: 'thread-ui-action',
        hostSupportsApproval: true,
      }),
    );
    expect(retry.success).toBe(true);
    expect(retry.data).toEqual({ id: 'post-1' });
    expect(publishHandler.createPost).not.toHaveBeenCalled();
  });
});

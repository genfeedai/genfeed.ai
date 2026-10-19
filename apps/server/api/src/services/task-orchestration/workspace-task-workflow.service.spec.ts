import { WorkspaceTaskWorkflowService } from '@api/services/task-orchestration/workspace-task-workflow.service';
import {
  WORKSPACE_TASK_ACTION_IDS,
  WORKSPACE_TASK_WORKFLOW_DEFINITIONS,
} from '@api/services/task-orchestration/workspace-task-workflow-definition';

describe('WorkspaceTaskWorkflowService', () => {
  it('registers every task action and immutable graph', () => {
    const runner = {
      registerAction: vi.fn(),
      registerWorkflow: vi.fn(),
    };
    const service = new WorkspaceTaskWorkflowService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      runner as never,
      {} as never,
      {} as never,
      {} as never,
    );

    service.onModuleInit();

    expect(runner.registerAction.mock.calls.map(([id]) => id)).toEqual(
      expect.arrayContaining(Object.values(WORKSPACE_TASK_ACTION_IDS)),
    );
    expect(runner.registerAction).toHaveBeenCalledTimes(
      Object.values(WORKSPACE_TASK_ACTION_IDS).length,
    );
    expect(runner.registerWorkflow).toHaveBeenCalledTimes(
      WORKSPACE_TASK_WORKFLOW_DEFINITIONS.length,
    );
  });

  it('runs each agent subtask in its own thread', async () => {
    const runner = {
      enqueueWorkflow: vi.fn().mockResolvedValue({ executionId: 'exec-1' }),
      registerAction: vi.fn(),
      registerWorkflow: vi.fn(),
    };
    const threads = { create: vi.fn().mockResolvedValue({ id: 'thread-1' }) };
    const service = new WorkspaceTaskWorkflowService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      runner as never,
      {} as never,
      { error: vi.fn(), log: vi.fn() } as never,
      threads as never,
    );
    service.onModuleInit();
    const enqueue = runner.registerAction.mock.calls.find(
      ([id]) => id === WORKSPACE_TASK_ACTION_IDS.AGENT_ENQUEUE_EXECUTION,
    )?.[1];

    await enqueue({
      input: {
        request: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          request: 'Write a post',
          subtask: {
            agentType: 'general',
            brief: 'Draft the post',
            label: 'Draft',
            order: 0,
          },
          taskId: 'task-1',
          userId: 'user-1',
        },
      },
      provenance: {
        executionId: 'parent-1',
        idempotencyKey: 'key',
        nodeId: 'n',
      },
    });

    expect(threads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: 'org-1',
        title: 'Draft',
        userId: 'user-1',
      }),
    );
    const queued = runner.enqueueWorkflow.mock.calls[0][0];
    expect(queued.inputValues.request).toMatchObject({
      brandId: 'brand-1',
      content: 'Draft the post',
      threadId: 'thread-1',
    });
    expect(queued.metadata.threadId).toBe('thread-1');
  });
});

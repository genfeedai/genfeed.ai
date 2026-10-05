import { WorkspaceTaskExecutionListener } from '@api/services/task-orchestration/listeners/workspace-task-execution.listener';

describe('WorkspaceTaskExecutionListener', () => {
  const makeListener = () => {
    const taskOrchestrator = {
      handleExecutionCompletion: vi.fn().mockResolvedValue(undefined),
    };
    const logger = { error: vi.fn() };
    return {
      listener: new WorkspaceTaskExecutionListener(
        taskOrchestrator as never,
        logger as never,
      ),
      logger,
      taskOrchestrator,
    };
  };

  it('rolls up the task linked to the settled execution', async () => {
    const { listener, taskOrchestrator } = makeListener();

    await listener.handleExecutionTerminal({
      executionId: 'execution-1',
      organizationId: 'org-1',
      status: 'completed',
    });

    expect(taskOrchestrator.handleExecutionCompletion).toHaveBeenCalledWith(
      'execution-1',
      'org-1',
    );
  });

  it('logs rollup failures instead of rejecting the event', async () => {
    const { listener, logger, taskOrchestrator } = makeListener();
    taskOrchestrator.handleExecutionCompletion.mockRejectedValue(
      new Error('db down'),
    );

    await expect(
      listener.handleExecutionTerminal({
        executionId: 'execution-1',
        organizationId: 'org-1',
        status: 'failed',
      }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

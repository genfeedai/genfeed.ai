import { WORKFLOW_EXECUTION_TERMINAL_EVENT } from '@api/collections/workflow-executions/constants/workflow-execution-events.constants';
import { WorkspaceTaskExecutionListener } from '@api/services/task-orchestration/listeners/workspace-task-execution.listener';

import { TaskOrchestratorService } from '@api/services/task-orchestration/task-orchestrator.service';
import { WorkspaceTaskRollupModule } from '@api/services/task-orchestration/workspace-task-rollup.module';
import { LoggerService } from '@libs/logger/logger.service';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';

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

  it('receives a terminal event emitted by another provider in the same process (cancel through the API)', async () => {
    const handleExecutionCompletion = vi.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        WorkspaceTaskExecutionListener,
        {
          provide: TaskOrchestratorService,
          useValue: { handleExecutionCompletion },
        },
        { provide: LoggerService, useValue: { error: vi.fn() } },
      ],
    }).compile();
    await moduleRef.init();

    await moduleRef
      .get(EventEmitter2)
      .emitAsync(WORKFLOW_EXECUTION_TERMINAL_EVENT, {
        executionId: 'execution-1',
        organizationId: 'org-1',
        status: 'cancelled',
      });

    expect(handleExecutionCompletion).toHaveBeenCalledWith(
      'execution-1',
      'org-1',
    );
    await moduleRef.close();
  });

  it('is provided only by the rollup module that the API and workers import', () => {
    expect(
      Reflect.getMetadata('providers', WorkspaceTaskRollupModule),
    ).toContain(WorkspaceTaskExecutionListener);
  });
});

import { TaskOrchestratorService } from '@api/services/task-orchestration/task-orchestrator.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';

describe('TaskOrchestratorService', () => {
  const makeService = ({
    executions,
    task,
  }: {
    executions: Record<string, { metadata?: object; status: string }>;
    task: { linkedExecutionIds: string[]; status: string } | null;
  }) => {
    const stored = task && {
      assigneeUserId: 'user-1',
      id: 'task-1',
      outputType: 'image',
      platforms: [],
      request: 'a green apple',
      ...task,
    };
    const tasksService = {
      findOne: vi.fn(async () => (stored ? { ...stored } : stored)),
      // Compare-and-set, like the conditional write the real service issues.
      claimStatusTransition: vi.fn(
        async (_id: string, _org: string, from: string, to: string) => {
          if (!stored || stored.status !== from) return false;
          stored.status = to;
          return true;
        },
      ),
      // Persist the patch like the real service, so later reads see it.
      recordTaskEvent: vi.fn(
        async (
          _id: string,
          _organizationId: string,
          _userId: string,
          _event: { type: string },
          patch: { status?: string },
        ) => {
          if (stored && patch.status) stored.status = patch.status;
        },
      ),
    };
    const workflowExecutionsService = {
      findOne: vi.fn(async (where: { id: string }) => {
        const execution = executions[where.id];
        return execution ? { id: where.id, ...execution } : null;
      }),
    };
    const quality = {
      assess: vi.fn().mockResolvedValue({
        gate: 'pass',
        score: 90,
        suggestedFixes: [],
      }),
    };
    return {
      quality,
      service: new TaskOrchestratorService(
        workflowExecutionsService as never,
        tasksService as never,
        quality as never,
        { log: vi.fn() } as never,
      ),
      tasksService,
    };
  };

  const completed = { status: WorkflowExecutionStatus.COMPLETED };

  it('moves an in-progress task to review once every execution settled', async () => {
    const { service, tasksService } = makeService({
      executions: { 'execution-1': completed },
      task: { linkedExecutionIds: ['execution-1'], status: 'in_progress' },
    });

    await service.handleExecutionCompletion('execution-1', 'org-1');

    expect(tasksService.recordTaskEvent).toHaveBeenLastCalledWith(
      'task-1',
      'org-1',
      'user-1',
      expect.objectContaining({ type: 'task_ready_for_review' }),
      expect.objectContaining({ status: 'in_review' }),
    );
  });

  it('ignores a late or duplicate event for a task that already moved on', async () => {
    const { quality, service, tasksService } = makeService({
      executions: { 'execution-1': completed },
      task: { linkedExecutionIds: ['execution-1'], status: 'in_review' },
    });

    await service.handleExecutionCompletion('execution-1', 'org-1');

    expect(tasksService.recordTaskEvent).not.toHaveBeenCalled();
    expect(quality.assess).not.toHaveBeenCalled();
  });

  it('runs the paid quality assessment once when the listener and reconcile race', async () => {
    const { quality, service, tasksService } = makeService({
      executions: { 'execution-1': completed },
      task: { linkedExecutionIds: ['execution-1'], status: 'in_progress' },
    });

    await Promise.all([
      service.handleExecutionCompletion('execution-1', 'org-1'),
      service.reconcileTerminalExecutions(['execution-1'], 'org-1'),
      service.handleExecutionCompletion('execution-1', 'org-1'),
    ]);

    expect(quality.assess).toHaveBeenCalledOnce();
    expect(
      tasksService.recordTaskEvent.mock.calls.filter(
        ([, , , event]) => event.type === 'task_ready_for_review',
      ),
    ).toHaveLength(1);
  });

  describe('reconcileTerminalExecutions (finish-before-link)', () => {
    it('rolls up a task whose only execution settled before it was linked', async () => {
      const { service, tasksService } = makeService({
        executions: { 'execution-1': completed },
        task: { linkedExecutionIds: ['execution-1'], status: 'in_progress' },
      });

      await service.reconcileTerminalExecutions(['execution-1'], 'org-1');

      expect(tasksService.recordTaskEvent).toHaveBeenLastCalledWith(
        'task-1',
        'org-1',
        'user-1',
        expect.objectContaining({ type: 'task_ready_for_review' }),
        expect.objectContaining({ status: 'in_review' }),
      );
    });

    it('fails the task when the early-settled execution failed', async () => {
      const { service, tasksService } = makeService({
        executions: {
          'execution-1': { status: WorkflowExecutionStatus.FAILED },
        },
        task: { linkedExecutionIds: ['execution-1'], status: 'in_progress' },
      });

      await service.reconcileTerminalExecutions(['execution-1'], 'org-1');

      expect(tasksService.recordTaskEvent).toHaveBeenLastCalledWith(
        'task-1',
        'org-1',
        'user-1',
        expect.objectContaining({ type: 'task_failed' }),
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('leaves running executions alone and rolls up only once when all settled', async () => {
      const running = makeService({
        executions: {
          'execution-1': completed,
          'execution-2': { status: WorkflowExecutionStatus.RUNNING },
        },
        task: {
          linkedExecutionIds: ['execution-1', 'execution-2'],
          status: 'in_progress',
        },
      });
      await running.service.reconcileTerminalExecutions(
        ['execution-1', 'execution-2'],
        'org-1',
      );
      expect(
        running.tasksService.recordTaskEvent.mock.calls.map(
          ([, , , event]) => event.type,
        ),
      ).toEqual(['execution_completed']);

      const settled = makeService({
        executions: { 'execution-1': completed, 'execution-2': completed },
        task: {
          linkedExecutionIds: ['execution-1', 'execution-2'],
          status: 'in_progress',
        },
      });
      await settled.service.reconcileTerminalExecutions(
        ['execution-1', 'execution-2'],
        'org-1',
      );
      expect(
        settled.tasksService.recordTaskEvent.mock.calls.filter(
          ([, , , event]) => event.type === 'task_ready_for_review',
        ),
      ).toHaveLength(1);
    });
  });
});

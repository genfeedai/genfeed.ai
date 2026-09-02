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
});

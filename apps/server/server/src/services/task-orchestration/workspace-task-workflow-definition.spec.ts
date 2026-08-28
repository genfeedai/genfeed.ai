import {
  buildWorkspaceAgentRunWorkflowDefinition,
  buildWorkspaceAgentTaskWorkflowDefinition,
  buildWorkspaceFacecamTaskWorkflowDefinition,
  buildWorkspaceTaskWorkflowDefinition,
  WORKSPACE_TASK_ACTION_IDS,
  WORKSPACE_TASK_WORKFLOW_IDS,
} from '@server/services/task-orchestration/workspace-task-workflow-definition';

describe('workspace task workflow definitions', () => {
  it('routes task types into explicit child workflows', () => {
    const definition = buildWorkspaceTaskWorkflowDefinition();
    const fanOuts = definition.definition.nodes.filter(
      (node) => node.data.config.actionId === 'workflow.for-each',
    );

    expect(
      fanOuts.map(
        (node) =>
          (node.data.config.parameters as Record<string, unknown>)
            .childWorkflowId,
      ),
    ).toEqual([
      WORKSPACE_TASK_WORKFLOW_IDS.AGENT,
      WORKSPACE_TASK_WORKFLOW_IDS.FACECAM,
    ]);
  });

  it('fans decomposed subtasks through the durable agent-run child graph', () => {
    const definition = buildWorkspaceAgentTaskWorkflowDefinition();
    const fanOut = definition.definition.nodes.find(
      (node) => node.id === 'execute-agent-runs',
    );

    expect(fanOut?.data.config.parameters).toMatchObject({
      childWorkflowId: WORKSPACE_TASK_WORKFLOW_IDS.AGENT_RUN,
      maxConcurrency: 1,
      mode: 'await',
    });
  });

  it('makes create, enqueue, and task-event recording separate agent-run actions', () => {
    const definition = buildWorkspaceAgentRunWorkflowDefinition();

    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      WORKSPACE_TASK_ACTION_IDS.AGENT_RUN_CREATE,
      WORKSPACE_TASK_ACTION_IDS.AGENT_RUN_ENQUEUE,
      WORKSPACE_TASK_ACTION_IDS.AGENT_RECORD_RUN,
    ]);
  });

  it('makes every facecam state transition an explicit action', () => {
    const definition = buildWorkspaceFacecamTaskWorkflowDefinition();

    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      WORKSPACE_TASK_ACTION_IDS.FACECAM_PREPARE,
      WORKSPACE_TASK_ACTION_IDS.FACECAM_RECORD_START,
      WORKSPACE_TASK_ACTION_IDS.FACECAM_GENERATE,
      WORKSPACE_TASK_ACTION_IDS.FACECAM_ATTACH_OUTPUT,
      WORKSPACE_TASK_ACTION_IDS.FACECAM_RECORD_DISPATCH,
      WORKSPACE_TASK_ACTION_IDS.FACECAM_SCHEDULE_POLL,
    ]);
  });
});

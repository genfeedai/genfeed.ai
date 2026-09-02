import {
  buildWorkspaceAgentExecutionWorkflowDefinition,
  buildWorkspaceAgentTaskWorkflowDefinition,
  buildWorkspaceFacecamTaskWorkflowDefinition,
  buildWorkspaceTaskWorkflowDefinition,
  WORKSPACE_TASK_ACTION_IDS,
  WORKSPACE_TASK_WORKFLOW_IDS,
} from '@api/services/task-orchestration/workspace-task-workflow-definition';

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

  it('fans decomposed subtasks through child workflow executions', () => {
    const definition = buildWorkspaceAgentTaskWorkflowDefinition();
    const fanOut = definition.definition.nodes.find(
      (node) => node.id === 'execute-agent-executions',
    );

    expect(fanOut?.data.config.parameters).toMatchObject({
      childWorkflowId: WORKSPACE_TASK_WORKFLOW_IDS.AGENT_EXECUTION,
      maxConcurrency: 1,
      mode: 'await',
    });
  });

  it('enqueues each subtask through one workflow execution action', () => {
    const definition = buildWorkspaceAgentExecutionWorkflowDefinition();

    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([WORKSPACE_TASK_ACTION_IDS.AGENT_ENQUEUE_EXECUTION]);
  });

  it('makes every facecam state transition an explicit action', () => {
    const definition = buildWorkspaceFacecamTaskWorkflowDefinition();

    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      WORKSPACE_TASK_ACTION_IDS.FACECAM_PREPARE,
      WORKSPACE_TASK_ACTION_IDS.FACECAM_RECORD_START,
      WORKSPACE_TASK_ACTION_IDS.FACECAM_GENERATE,
      WORKSPACE_TASK_ACTION_IDS.FACECAM_FINALIZE,
      WORKSPACE_TASK_ACTION_IDS.FACECAM_FINALIZE_FAILURE,
    ]);
    expect(definition.definition.edges).toContainEqual(
      expect.objectContaining({
        source: 'generate-facecam',
        sourceHandle: 'failure',
        target: 'finalize-facecam-failure',
      }),
    );
  });
});

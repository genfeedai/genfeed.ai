import {
  buildScheduledPostWorkflowDefinition,
  SCHEDULED_POST_ACTION_IDS,
  SCHEDULED_POST_WORKFLOW_ID,
} from '@api/collections/posts/services/scheduled-post-workflow-definition';

describe('scheduled post workflow definition', () => {
  it('models claim, delivery, and finalization as separate action nodes', () => {
    const workflow = buildScheduledPostWorkflowDefinition();

    expect(workflow.canonicalId).toBe(SCHEDULED_POST_WORKFLOW_ID);
    expect(
      workflow.definition.nodes?.map(
        (node) =>
          (node.data.config as { actionId?: string } | undefined)?.actionId,
      ),
    ).toEqual([
      SCHEDULED_POST_ACTION_IDS.CLAIM,
      SCHEDULED_POST_ACTION_IDS.DELIVER,
      SCHEDULED_POST_ACTION_IDS.FINALIZE,
    ]);
    expect(workflow.definition.edges).toHaveLength(3);
    expect(workflow.resultNodeId).toBe('finalize-publish');
  });
});

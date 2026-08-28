import {
  BATCH_CONTENT_ACTION_IDS,
  BATCH_CONTENT_ITEM_WORKFLOW_ID,
  buildBatchContentItemWorkflowDefinition,
  buildBatchContentWorkflowDefinition,
} from '@server/services/batch-content/batch-content-workflow-definition';

describe('batch content workflow definitions', () => {
  it('fans out through the generic workflow action', () => {
    const definition = buildBatchContentWorkflowDefinition();
    const fanOut = definition.definition.nodes.find(
      (node) => node.id === 'generate-items',
    );

    expect(fanOut?.data.config.actionId).toBe('workflow.for-each');
    expect(fanOut?.data.config.parameters).toMatchObject({
      childWorkflowId: BATCH_CONTENT_ITEM_WORKFLOW_ID,
      mode: 'await',
    });
    expect(definition.resultNodeId).toBe('rank-drafts');
  });

  it('runs each skill execution as one action-backed child workflow', () => {
    const definition = buildBatchContentItemWorkflowDefinition();

    expect(definition.definition.nodes).toHaveLength(1);
    expect(definition.definition.nodes[0]?.data.config.actionId).toBe(
      BATCH_CONTENT_ACTION_IDS.GENERATE_ITEM,
    );
  });
});

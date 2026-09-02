import {
  BATCH_CONTENT_ACTION_IDS,
  buildBatchContentItemWorkflowDefinition,
  buildBatchContentWorkflowDefinition,
} from '@api/services/batch-content/batch-content-workflow-definition';

describe('batch content workflow definitions', () => {
  it('fans out through the generic workflow action', () => {
    const definition = buildBatchContentWorkflowDefinition('content-writing');
    const fanOut = definition.definition.nodes.find(
      (node) => node.id === 'generate-items',
    );

    expect(fanOut?.data.config.actionId).toBe('workflow.for-each');
    expect(fanOut?.data.config.parameters).toMatchObject({
      childWorkflowId: 'content.batch.generate-item.content-writing',
      mode: 'await',
    });
    expect(definition.resultNodeId).toBe('rank-drafts');
  });

  it('runs each skill execution as one action-backed child workflow', () => {
    const definition =
      buildBatchContentItemWorkflowDefinition('content-writing');

    expect(definition.definition.nodes).toHaveLength(2);
    expect(definition.definition.nodes[0]?.data.config.actionId).toBe(
      BATCH_CONTENT_ACTION_IDS.PREPARE_ITEM,
    );
    expect(definition.definition.nodes[1]?.data.config).toMatchObject({
      actionId: 'workflow.run-child',
      parameters: { childWorkflowId: 'skill.content-writing' },
    });
  });
});

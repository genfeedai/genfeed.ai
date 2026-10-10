import {
  buildTurboContentItemWorkflowDefinition,
  buildTurboContentWorkflowDefinition,
  TURBO_CONTENT_ACTION_IDS,
} from '@api/services/turbo-content/turbo-content-workflow-definition';

describe('Turbo content workflow definitions', () => {
  it('fans out through the generic workflow action', () => {
    const definition = buildTurboContentWorkflowDefinition('content-writing');
    expect(definition.organizationModule).toBe('turbo');
    const fanOut = definition.definition.nodes.find(
      (node) => node.id === 'generate-items',
    );

    expect(fanOut?.data.config.actionId).toBe('workflow.for-each');
    expect(fanOut?.data.config.parameters).toMatchObject({
      childWorkflowId: 'content.turbo.generate-item.content-writing',
      mode: 'await',
    });
    expect(definition.resultNodeId).toBe('rank-drafts');
  });

  it('runs each skill execution as one action-backed child workflow', () => {
    const definition =
      buildTurboContentItemWorkflowDefinition('content-writing');
    expect(definition.organizationModule).toBe('turbo');

    expect(definition.definition.nodes).toHaveLength(2);
    expect(definition.definition.nodes[0]?.data.config.actionId).toBe(
      TURBO_CONTENT_ACTION_IDS.PREPARE_ITEM,
    );
    expect(definition.definition.nodes[1]?.data.config).toMatchObject({
      actionId: 'workflow.run-child',
      parameters: { childWorkflowId: 'skill.content-writing' },
    });
  });
});

import {
  buildRssItemWorkflowDefinition,
  buildRssSourceWorkflowDefinition,
  buildRssSweepWorkflowDefinition,
} from '@api/collections/rss-sources/services/rss-sweep-workflow-definition';

describe('RSS sweep workflows', () => {
  it('uses nested source and item fan-out', () => {
    expect(
      buildRssSweepWorkflowDefinition().definition.nodes[1]?.data.config
        .actionId,
    ).toBe('workflow.for-each-tenant');
    expect(
      buildRssSourceWorkflowDefinition().definition.nodes[1]?.data.config
        .actionId,
    ).toBe('workflow.for-each');
  });

  it('branches import and publication with executable conditions', () => {
    expect(
      buildRssItemWorkflowDefinition().definition.nodes.filter(
        (node) => node.type === 'condition',
      ),
    ).toHaveLength(2);
  });
});

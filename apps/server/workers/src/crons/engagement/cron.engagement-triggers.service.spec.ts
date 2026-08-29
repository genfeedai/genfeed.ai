import {
  buildEngagementRuleWorkflowDefinition,
  buildEngagementSweepWorkflowDefinition,
} from '@workers/crons/engagement/engagement-sweep-workflow-definition';

describe('engagement sweep workflows', () => {
  it('fans discovery into child rule workflows', () => {
    const sweep = buildEngagementSweepWorkflowDefinition();
    expect(sweep.definition.nodes).toHaveLength(2);
    expect(sweep.definition.nodes[1]?.data.config.actionId).toBe(
      'workflow.for-each-tenant',
    );
  });

  it('uses executable outcome and publish conditions', () => {
    const child = buildEngagementRuleWorkflowDefinition();
    expect(
      child.definition.nodes.filter((node) => node.type === 'condition'),
    ).toHaveLength(5);
    expect(child.definition.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceHandle: 'true' }),
        expect.objectContaining({ sourceHandle: 'false' }),
      ]),
    );
  });
});

import {
  buildStreakOrganizationWorkflowDefinition,
  buildStreakRecordWorkflowDefinition,
  buildStreakSweepWorkflowDefinition,
} from '@workers/crons/streaks/streak-maintenance-workflow-definition';

describe('streak maintenance workflows', () => {
  it('uses organization and record fan-out', () => {
    expect(
      buildStreakSweepWorkflowDefinition().definition.nodes[1]?.data.config
        .actionId,
    ).toBe('workflow.for-each-tenant');
    expect(
      buildStreakOrganizationWorkflowDefinition().definition.nodes[1]?.data
        .config.actionId,
    ).toBe('workflow.for-each');
  });

  it('models state transitions with executable conditions', () => {
    expect(
      buildStreakRecordWorkflowDefinition().definition.nodes.filter(
        (node) => node.type === 'condition',
      ),
    ).toHaveLength(3);
  });
});

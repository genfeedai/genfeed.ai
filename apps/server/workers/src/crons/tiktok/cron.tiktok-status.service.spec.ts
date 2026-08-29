import {
  buildTiktokStatusReconcileDefinition,
  buildTiktokStatusSweepDefinition,
} from '@workers/crons/tiktok/tiktok-status-workflow-definition';

describe('TikTok status workflows', () => {
  it('fans pending posts into atomic reconciliation workflows', () => {
    expect(
      buildTiktokStatusSweepDefinition().definition.nodes[1]?.data.config
        .actionId,
    ).toBe('workflow.for-each-tenant');
    expect(
      buildTiktokStatusReconcileDefinition().definition.nodes,
    ).toHaveLength(1);
  });
});

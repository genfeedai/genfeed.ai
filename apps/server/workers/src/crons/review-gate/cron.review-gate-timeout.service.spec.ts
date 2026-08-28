import {
  buildReviewGateTimeoutResolveDefinition,
  buildReviewGateTimeoutSweepDefinition,
} from '@workers/crons/review-gate/review-gate-timeout-workflow-definition';

describe('review gate timeout workflows', () => {
  it('discovers timed-out gates and fans into the resolver workflow', () => {
    const sweep = buildReviewGateTimeoutSweepDefinition();
    expect(sweep.definition.nodes[1]?.data.config.actionId).toBe(
      'workflow.for-each',
    );
    expect(
      buildReviewGateTimeoutResolveDefinition().definition.nodes,
    ).toHaveLength(1);
  });
});

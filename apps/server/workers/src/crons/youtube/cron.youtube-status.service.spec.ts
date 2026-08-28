import {
  buildYoutubeStatusReconcileDefinition,
  buildYoutubeStatusSweepDefinition,
} from '@workers/crons/youtube/youtube-maintenance-workflow-definition';

describe('YouTube status workflows', () => {
  it('fans pending posts into status reconciliation workflows', () => {
    expect(
      buildYoutubeStatusSweepDefinition().definition.nodes[1]?.data.config
        .actionId,
    ).toBe('workflow.for-each-tenant');
    expect(
      buildYoutubeStatusReconcileDefinition().definition.nodes,
    ).toHaveLength(1);
  });
});

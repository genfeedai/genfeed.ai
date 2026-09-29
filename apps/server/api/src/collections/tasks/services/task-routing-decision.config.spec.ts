import { resolveTaskRoutingDecisionRollout } from '@api/collections/tasks/services/task-routing-decision.config';
import { parsePlatformFeatureSettings } from '@genfeedai/contracts/constants';

describe('resolveTaskRoutingDecisionRollout', () => {
  it('never resolves live, even from a hand-edited row', () => {
    expect(
      resolveTaskRoutingDecisionRollout(
        parsePlatformFeatureSettings({ taskRoutingDecisionMode: 'live' }),
      ).mode,
    ).toBe('shadow');
  });
});

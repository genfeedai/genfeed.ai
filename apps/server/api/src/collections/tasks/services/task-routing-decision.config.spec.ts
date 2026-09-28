import { resolveTaskRoutingDecisionRollout } from '@api/collections/tasks/services/task-routing-decision.config';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  parsePlatformFeatureSettings,
} from '@genfeedai/contracts/constants';

describe('resolveTaskRoutingDecisionRollout', () => {
  it('defaults to shadow at the conservative threshold', () => {
    expect(
      resolveTaskRoutingDecisionRollout(DEFAULT_PLATFORM_FEATURE_SETTINGS),
    ).toEqual({ minConfidence: 0.85, mode: 'shadow' });
  });

  it('reads the threshold and honours an explicit off', () => {
    expect(
      resolveTaskRoutingDecisionRollout({
        ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
        taskRoutingDecisionMode: 'off',
        taskRoutingMinConfidence: 0.6,
      }),
    ).toEqual({ minConfidence: 0.6, mode: 'off' });
  });

  it('never resolves live, even from a hand-edited row', () => {
    expect(
      resolveTaskRoutingDecisionRollout(
        parsePlatformFeatureSettings({ taskRoutingDecisionMode: 'live' }),
      ).mode,
    ).toBe('shadow');
  });
});

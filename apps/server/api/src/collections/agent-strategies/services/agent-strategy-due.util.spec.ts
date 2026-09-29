import {
  AGENT_STRATEGY_MAX_CONSECUTIVE_FAILURES,
  isAgentStrategyDue,
} from '@api/collections/agent-strategies/services/agent-strategy-due.util';

describe('isAgentStrategyDue', () => {
  const now = new Date('2026-09-26T12:00:00.000Z');

  it('ignores an unparseable nextRunAt rather than treating it as due-blocking', () => {
    expect(isAgentStrategyDue({ nextRunAt: 'not-a-date' }, now)).toBe(true);
  });

  it('is not due once consecutiveFailures reaches the max', () => {
    expect(
      isAgentStrategyDue(
        { consecutiveFailures: AGENT_STRATEGY_MAX_CONSECUTIVE_FAILURES },
        now,
      ),
    ).toBe(false);
  });
});

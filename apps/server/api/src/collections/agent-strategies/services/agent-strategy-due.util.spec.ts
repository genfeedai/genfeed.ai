import {
  AGENT_STRATEGY_MAX_CONSECUTIVE_FAILURES,
  isAgentStrategyDue,
} from '@api/collections/agent-strategies/services/agent-strategy-due.util';

describe('isAgentStrategyDue', () => {
  const now = new Date('2026-09-26T12:00:00.000Z');

  it('is due with an empty config (no failures, no schedule, no manual gate)', () => {
    expect(isAgentStrategyDue({}, now)).toBe(true);
  });

  it('is due when nextRunAt is in the past', () => {
    expect(
      isAgentStrategyDue({ nextRunAt: '2026-09-26T11:59:00.000Z' }, now),
    ).toBe(true);
  });

  it('is due when nextRunAt exactly equals now', () => {
    expect(isAgentStrategyDue({ nextRunAt: now.toISOString() }, now)).toBe(
      true,
    );
  });

  it('is not due when nextRunAt is in the future', () => {
    expect(
      isAgentStrategyDue({ nextRunAt: '2026-09-26T12:01:00.000Z' }, now),
    ).toBe(false);
  });

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

  it('is still due one failure short of the max', () => {
    expect(
      isAgentStrategyDue(
        { consecutiveFailures: AGENT_STRATEGY_MAX_CONSECUTIVE_FAILURES - 1 },
        now,
      ),
    ).toBe(true);
  });

  it('is not due when requiresManualReactivation is set, regardless of schedule', () => {
    expect(
      isAgentStrategyDue(
        {
          nextRunAt: '2026-09-26T11:00:00.000Z',
          requiresManualReactivation: true,
        },
        now,
      ),
    ).toBe(false);
  });
});

import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { describe, expect, it } from 'vitest';
import { extractAnalyticsPeriod } from './extract-analytics-period';

function action(partial: Partial<AgentUiAction>): AgentUiAction {
  return partial as AgentUiAction;
}

describe('extractAnalyticsPeriod', () => {
  it('prefers an explicit data.period', () => {
    expect(
      extractAnalyticsPeriod(
        action({
          data: { period: '  7d  ' },
          id: 'analytics-snapshot:brand-1:30d',
          title: 'Snapshot (90d)',
        }),
      ),
    ).toBe('7d');
  });

  it('reads the period segment out of the action id', () => {
    expect(
      extractAnalyticsPeriod(action({ id: 'analytics-snapshot:brand-1:30d' })),
    ).toBe('30d');
  });

  it('keeps colons that appear inside the period segment', () => {
    expect(
      extractAnalyticsPeriod(action({ id: 'analytics-snapshot:brand-1:a:b' })),
    ).toBe('a:b');
  });

  it('falls through when the id is not a snapshot id', () => {
    expect(extractAnalyticsPeriod(action({ id: 'other:brand-1:30d' }))).toBe(
      'summary',
    );
    expect(
      extractAnalyticsPeriod(action({ id: 'analytics-snapshot:only' })),
    ).toBe('summary');
  });

  it('reads a trailing parenthesised period out of the title', () => {
    expect(extractAnalyticsPeriod(action({ title: 'Snapshot (30d)' }))).toBe(
      '30d',
    );
    expect(extractAnalyticsPeriod(action({ title: 'Snapshot (30d)   ' }))).toBe(
      '30d',
    );
  });

  it('ignores a parenthesised group that is not the trailing token', () => {
    expect(extractAnalyticsPeriod(action({ title: 'a (b) c)' }))).toBe(
      'summary',
    );
    expect(
      extractAnalyticsPeriod(action({ title: 'Snapshot (30d) extra' })),
    ).toBe('summary');
  });

  it('defaults to summary when nothing identifies a period', () => {
    expect(extractAnalyticsPeriod(action({}))).toBe('summary');
    expect(extractAnalyticsPeriod(action({ title: 'Snapshot ()' }))).toBe(
      'summary',
    );
  });

  it('stays linear on adversarial input', () => {
    const started = performance.now();
    extractAnalyticsPeriod(
      action({ title: `Snapshot (30d${' '.repeat(200_000)}` }),
    );
    extractAnalyticsPeriod(
      action({ id: `analytics-snapshot:${'a'.repeat(200_000)}` }),
    );
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

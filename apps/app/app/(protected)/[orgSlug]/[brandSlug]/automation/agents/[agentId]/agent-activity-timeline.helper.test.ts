import type { AgentActivityEntry } from '@props/automation/agent-activity-timeline.props';
import { describe, expect, it } from 'vitest';
import { mergeAgentActivity } from './agent-activity-timeline.helper';

function entry(overrides: Partial<AgentActivityEntry>): AgentActivityEntry {
  return {
    id: 'entry-1',
    timestamp: '2026-01-01T00:00:00.000Z',
    title: 'Entry',
    type: 'content',
    ...overrides,
  };
}

describe('mergeAgentActivity', () => {
  it('sorts an unparsable timestamp last instead of throwing', () => {
    const merged = mergeAgentActivity([
      entry({ id: 'good', timestamp: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'bad', timestamp: 'not-a-date' }),
    ]);

    expect(merged.map((item) => item.id)).toEqual(['good', 'bad']);
  });
});

import type { AgentActivityEntry } from '@props/automation/agent-activity-timeline.props';
import { describe, expect, it } from 'vitest';
import {
  filterAgentActivity,
  mergeAgentActivity,
} from './agent-activity-timeline.helper';

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
  it('interleaves every source into one feed sorted newest first', () => {
    const content = [
      entry({
        id: 'post-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        type: 'content',
      }),
    ];
    const reports = [
      entry({
        id: 'report-1',
        timestamp: '2026-01-03T00:00:00.000Z',
        type: 'report',
      }),
    ];
    const runs = [
      entry({
        id: 'run-1',
        timestamp: '2026-01-02T00:00:00.000Z',
        type: 'run',
      }),
    ];

    const merged = mergeAgentActivity(content, reports, runs);

    expect(merged.map((item) => item.id)).toEqual([
      'report-1',
      'run-1',
      'post-1',
    ]);
  });

  it('sorts an unparsable timestamp last instead of throwing', () => {
    const merged = mergeAgentActivity([
      entry({ id: 'good', timestamp: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'bad', timestamp: 'not-a-date' }),
    ]);

    expect(merged.map((item) => item.id)).toEqual(['good', 'bad']);
  });

  it('returns an empty feed when every source is empty', () => {
    expect(mergeAgentActivity([], [], [])).toEqual([]);
  });
});

describe('filterAgentActivity', () => {
  const entries = [
    entry({ id: 'content-1', type: 'content' }),
    entry({ id: 'report-1', type: 'report' }),
    entry({ id: 'run-1', type: 'run' }),
  ];

  it('passes every entry through for "all"', () => {
    expect(filterAgentActivity(entries, 'all')).toEqual(entries);
  });

  it('narrows to just one type', () => {
    expect(filterAgentActivity(entries, 'run').map((item) => item.id)).toEqual([
      'run-1',
    ]);
  });

  it('narrows to an empty list when no entry matches the type', () => {
    expect(filterAgentActivity([entries[0]], 'run')).toEqual([]);
  });
});

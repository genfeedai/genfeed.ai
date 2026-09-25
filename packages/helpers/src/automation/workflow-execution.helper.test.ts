import { describe, expect, it } from 'vitest';
import {
  getLocalDayWindow,
  getWorkflowExecutionLabel,
  getWorkflowLabel,
} from './workflow-execution.helper';

describe('workflow labels', () => {
  it('trims names and uses human-readable fallbacks for blank names', () => {
    expect(getWorkflowLabel('  Daily digest  ')).toBe('Daily digest');
    for (const label of [null, undefined, '', '  ']) {
      expect(getWorkflowLabel(label)).toBe('Untitled workflow');
    }
  });
  it('prefers the included name, then metadata, without exposing an ID', () => {
    expect(
      getWorkflowExecutionLabel({
        workflow: { label: ' Publish ' },
        metadata: { label: 'Other' },
      }),
    ).toBe('Publish');
    expect(
      getWorkflowExecutionLabel({
        workflow: { label: ' ' },
        metadata: { label: ' Daily digest ' },
      }),
    ).toBe('Daily digest');
    expect(
      getWorkflowExecutionLabel({ workflow: 'raw-id', workflowId: 'raw-id' }),
    ).toBe('Untitled workflow');
    expect(getWorkflowExecutionLabel({}, 'Workflow unavailable')).toBe(
      'Workflow unavailable',
    );
  });
  it('labels proactive agent work without exposing the internal engine name', () => {
    expect(
      getWorkflowExecutionLabel({
        workflow: { label: 'Agent Turn Execute' },
        result: {
          metadata: {
            source: 'proactive',
            canonicalId: 'agent.turn.execute',
            strategyId: 'strategy-1',
          },
        },
      }),
    ).toBe('Agent run');
  });
});

describe('getLocalDayWindow', () => {
  it('uses consecutive local midnights, not a rolling 24-hour interval', () => {
    const now = new Date(2026, 8, 24, 23, 42);
    const { dayStart, dayEnd } = getLocalDayWindow(now);
    expect(new Date(dayStart)).toEqual(new Date(2026, 8, 24));
    expect(new Date(dayEnd)).toEqual(new Date(2026, 8, 25));
  });
});

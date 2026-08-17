import { describe, expect, it } from 'vitest';
import { getWorkflowLabel } from './get-workflow-label';

describe('getWorkflowLabel', () => {
  it('prefers the included workflow label', () => {
    expect(
      getWorkflowLabel({
        workflow: { id: 'wf-1', label: 'Daily digest' },
        workflowId: 'wf-1',
      }),
    ).toBe('Daily digest');
  });

  it('uses the catalog label when the include is missing', () => {
    expect(
      getWorkflowLabel(
        { workflowId: 'wf-1' },
        new Map([['wf-1', 'Daily digest']]),
      ),
    ).toBe('Daily digest');
  });

  it('does not render a raw workflow id as the title', () => {
    expect(
      getWorkflowLabel({
        workflowId: 'clxyz0123456789',
      }),
    ).toBe('Untitled workflow');
  });
});

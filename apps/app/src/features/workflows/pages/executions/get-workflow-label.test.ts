import { describe, expect, it } from 'vitest';
import { catalogWorkflowLabels, getWorkflowLabel } from './get-workflow-label';

describe('catalogWorkflowLabels', () => {
  it('keeps trimmed labels keyed by workflow id', () => {
    expect(
      catalogWorkflowLabels([
        { id: 'wf-1', label: '  Daily digest  ' },
        { id: 'wf-2', label: 'Weekly recap' },
      ]),
    ).toEqual(
      new Map([
        ['wf-1', 'Daily digest'],
        ['wf-2', 'Weekly recap'],
      ]),
    );
  });

  it('skips rows whose label is missing, empty, or whitespace', () => {
    expect(
      catalogWorkflowLabels([
        { id: 'wf-missing' },
        { id: 'wf-null', label: null },
        { id: 'wf-empty', label: '' },
        { id: 'wf-blank', label: '   ' },
        { id: 'wf-ok', label: 'Kept' },
      ]),
    ).toEqual(new Map([['wf-ok', 'Kept']]));
  });
});

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

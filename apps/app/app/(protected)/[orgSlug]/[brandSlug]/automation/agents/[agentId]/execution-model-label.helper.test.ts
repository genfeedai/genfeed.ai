import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { getExecutionModelLabel } from './execution-model-label.helper';

function buildExecution(
  metadata: Record<string, unknown> | undefined,
): IWorkflowExecution {
  return { metadata } as unknown as IWorkflowExecution;
}

describe('getExecutionModelLabel', () => {
  it('shows the routed model when the actual model differs from the requested one', () => {
    expect(
      getExecutionModelLabel(
        buildExecution({
          actualModel: 'google/gemini-2.5-flash',
          requestedModel: 'openai/gpt-5.6-terra',
        }),
      ),
    ).toBe('google/gemini-2.5-flash via openai/gpt-5.6-terra');
  });

  it('shows just the model when actual and requested match', () => {
    expect(
      getExecutionModelLabel(
        buildExecution({
          actualModel: 'openai/gpt-5.6-terra',
          requestedModel: 'openai/gpt-5.6-terra',
        }),
      ),
    ).toBe('openai/gpt-5.6-terra');
  });

  it('falls back to Untracked when no model metadata is present', () => {
    expect(getExecutionModelLabel(buildExecution(undefined))).toBe('Untracked');
  });
});

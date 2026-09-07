import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { getExecutionCredits } from './workflow-execution.helpers';

function makeExecution(
  overrides: Partial<IWorkflowExecution> = {},
): IWorkflowExecution {
  return {
    id: 'exec-1',
    status: 'COMPLETED',
    ...overrides,
  } as IWorkflowExecution;
}

describe('getExecutionCredits', () => {
  it('prefers actual credits from accounting', () => {
    expect(
      getExecutionCredits(
        makeExecution({
          accounting: {
            actualCredits: 12,
            estimatedCredits: 20,
            knownActualCredits: 0,
          } as IWorkflowExecution['accounting'],
          creditsUsed: 3,
        }),
      ),
    ).toEqual({ isEstimate: false, value: 12 });
  });

  it('falls back to creditsUsed without accounting', () => {
    expect(getExecutionCredits(makeExecution({ creditsUsed: 7 }))).toEqual({
      isEstimate: false,
      value: 7,
    });
  });

  it('treats a missing creditsUsed as zero instead of crashing the row', () => {
    const credits = getExecutionCredits(
      makeExecution({ creditsUsed: undefined }),
    );

    expect(credits).toEqual({ isEstimate: false, value: 0 });
    expect(credits.value.toLocaleString()).toBe('0');
  });
});

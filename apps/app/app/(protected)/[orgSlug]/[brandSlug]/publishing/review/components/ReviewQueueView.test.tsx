import { TurboRunStatus } from '@genfeedai/contracts';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';

import { getTurboRunOptionLabel } from './ReviewQueueView';

describe('getTurboRunOptionLabel', () => {
  it('humanizes SCREAMING batch status for the publish header dropdown', () => {
    const turboRunId = testId('turboRun');
    const turboRun = {
      completedCount: 20,
      failedCount: 0,
      id: turboRunId,
      pendingCount: 0,
      status: TurboRunStatus.COMPLETED,
      totalCount: 20,
    } as ITurboRunSummary;

    expect(getTurboRunOptionLabel(turboRun)).toBe(
      `${turboRunId.slice(-6)} · 20 items · completed`,
    );
  });
});

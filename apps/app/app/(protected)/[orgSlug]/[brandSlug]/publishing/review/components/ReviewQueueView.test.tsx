import { BatchStatus } from '@genfeedai/contracts';
import type { IBatchSummary } from '@genfeedai/contracts/interfaces';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';

import { getBatchOptionLabel } from './ReviewQueueView';

describe('getBatchOptionLabel', () => {
  it('humanizes SCREAMING batch status for the publish header dropdown', () => {
    const batchId = testId('batch');
    const batch = {
      completedCount: 20,
      failedCount: 0,
      id: batchId,
      pendingCount: 0,
      status: BatchStatus.COMPLETED,
      totalCount: 20,
    } as IBatchSummary;

    expect(getBatchOptionLabel(batch)).toBe(
      `${batchId.slice(-6)} · 20 items · completed`,
    );
  });
});

import { BatchStatus } from '@genfeedai/enums';
import type { IBatchSummary } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';

import { getBatchOptionLabel } from './ReviewQueueView';

describe('getBatchOptionLabel', () => {
  it('humanizes SCREAMING batch status for the publish header dropdown', () => {
    const batch = {
      completedCount: 20,
      failedCount: 0,
      id: 'cmsk8xfnp0038erxnj4vbexgu',
      pendingCount: 0,
      status: BatchStatus.COMPLETED,
      totalCount: 20,
    } as IBatchSummary;

    expect(getBatchOptionLabel(batch)).toBe('vbexgu · 20 items · completed');
  });
});

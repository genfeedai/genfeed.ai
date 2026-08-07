import { BatchStatus } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import { isTerminalBatchStatus } from '@/features/workflows/utils/batch-status';

describe('isTerminalBatchStatus', () => {
  it('treats completed as terminal', () =>
    expect(isTerminalBatchStatus(BatchStatus.COMPLETED)).toBe(true));
  it('treats partial as terminal', () =>
    expect(isTerminalBatchStatus(BatchStatus.PARTIAL)).toBe(true));
  it('treats failed as terminal', () =>
    expect(isTerminalBatchStatus(BatchStatus.FAILED)).toBe(true));
  it('treats cancelled as terminal', () =>
    expect(isTerminalBatchStatus(BatchStatus.CANCELLED)).toBe(true));
  it('treats pending as non-terminal', () =>
    expect(isTerminalBatchStatus(BatchStatus.PENDING)).toBe(false));
  it('treats processing as non-terminal', () =>
    expect(isTerminalBatchStatus(BatchStatus.PROCESSING)).toBe(false));
});

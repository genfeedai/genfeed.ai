import { BatchStatus } from '@genfeedai/enums';
import { BatchStatus as PrismaBatchStatus } from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';
import {
  fromPrismaBatchStatus,
  toPrismaBatchStatus,
} from './batch-status-prisma.mapper';

describe('batch-status-prisma.mapper', () => {
  it('emits Prisma SCREAMING_SNAKE for every domain status', () => {
    for (const status of Object.values(BatchStatus)) {
      const prismaStatus = toPrismaBatchStatus(status);
      expect(Object.values(PrismaBatchStatus)).toContain(prismaStatus);
      expect(fromPrismaBatchStatus(prismaStatus)).toBe(
        // GENERATING is not a domain member — PROCESSING is the canonical name
        status === ('GENERATING' as BatchStatus)
          ? BatchStatus.PROCESSING
          : status,
      );
    }
  });

  it('round-trips every Prisma label', () => {
    for (const prismaStatus of Object.values(PrismaBatchStatus)) {
      expect(toPrismaBatchStatus(fromPrismaBatchStatus(prismaStatus))).toBe(
        prismaStatus,
      );
    }
  });

  it('accepts legacy lowercase domain spellings on write and read', () => {
    expect(toPrismaBatchStatus('pending')).toBe(PrismaBatchStatus.PENDING);
    expect(toPrismaBatchStatus('generating')).toBe(
      PrismaBatchStatus.PROCESSING,
    );
    expect(toPrismaBatchStatus('processing')).toBe(
      PrismaBatchStatus.PROCESSING,
    );
    expect(toPrismaBatchStatus('cancelled')).toBe(PrismaBatchStatus.CANCELLED);

    expect(fromPrismaBatchStatus('pending')).toBe(BatchStatus.PENDING);
    expect(fromPrismaBatchStatus('generating')).toBe(BatchStatus.PROCESSING);
    expect(fromPrismaBatchStatus('processing')).toBe(BatchStatus.PROCESSING);
    expect(fromPrismaBatchStatus('cancelled')).toBe(BatchStatus.CANCELLED);
  });

  it('always writes PENDING not pending (regression for stale enums dist)', () => {
    // Even if a stale package still exposes BatchStatus.PENDING === 'pending'
    expect(toPrismaBatchStatus('pending' as BatchStatus)).toBe('PENDING');
    expect(toPrismaBatchStatus(BatchStatus.PENDING)).toBe('PENDING');
  });
});

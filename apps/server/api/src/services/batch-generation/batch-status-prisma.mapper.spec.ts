import { BatchStatus } from '@genfeedai/enums';
import { BatchStatus as PrismaBatchStatus } from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';
import {
  fromPrismaBatchStatus,
  toPrismaBatchStatus,
} from './batch-status-prisma.mapper';

describe('batch-status-prisma.mapper', () => {
  it('is identity for every domain status (values match Prisma 1:1)', () => {
    for (const status of Object.values(BatchStatus)) {
      expect(toPrismaBatchStatus(status)).toBe(status);
      expect(fromPrismaBatchStatus(status)).toBe(status);
    }
  });

  it('round-trips every Prisma label', () => {
    for (const prismaStatus of Object.values(PrismaBatchStatus)) {
      expect(toPrismaBatchStatus(fromPrismaBatchStatus(prismaStatus))).toBe(
        prismaStatus,
      );
    }
  });

  it('accepts legacy lowercase domain spellings on read', () => {
    expect(fromPrismaBatchStatus('pending')).toBe(BatchStatus.PENDING);
    expect(fromPrismaBatchStatus('generating')).toBe(BatchStatus.PROCESSING);
    expect(fromPrismaBatchStatus('processing')).toBe(BatchStatus.PROCESSING);
    expect(fromPrismaBatchStatus('cancelled')).toBe(BatchStatus.CANCELLED);
  });
});

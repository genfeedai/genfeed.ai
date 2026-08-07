import { BatchStatus } from '@genfeedai/enums';
import { BatchStatus as PrismaBatchStatus } from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';
import {
  fromPrismaBatchStatus,
  toPrismaBatchStatus,
} from './batch-status-prisma.mapper';

describe('batch-status-prisma.mapper', () => {
  it('maps every domain status to a Prisma enum value', () => {
    expect(toPrismaBatchStatus(BatchStatus.PENDING)).toBe(
      PrismaBatchStatus.PENDING,
    );
    expect(toPrismaBatchStatus(BatchStatus.GENERATING)).toBe(
      PrismaBatchStatus.PROCESSING,
    );
    expect(toPrismaBatchStatus(BatchStatus.COMPLETED)).toBe(
      PrismaBatchStatus.COMPLETED,
    );
    expect(toPrismaBatchStatus(BatchStatus.PARTIAL)).toBe(
      PrismaBatchStatus.PARTIAL,
    );
    expect(toPrismaBatchStatus(BatchStatus.FAILED)).toBe(
      PrismaBatchStatus.FAILED,
    );
    expect(toPrismaBatchStatus(BatchStatus.CANCELLED)).toBe(
      PrismaBatchStatus.CANCELLED,
    );
  });

  it('round-trips Prisma → domain for every Prisma value', () => {
    for (const prismaStatus of Object.values(PrismaBatchStatus)) {
      const domain = fromPrismaBatchStatus(prismaStatus);
      expect(toPrismaBatchStatus(domain)).toBe(prismaStatus);
    }
  });

  it('accepts domain lowercase strings when reading legacy payloads', () => {
    expect(fromPrismaBatchStatus('pending')).toBe(BatchStatus.PENDING);
    expect(fromPrismaBatchStatus('generating')).toBe(BatchStatus.GENERATING);
    expect(fromPrismaBatchStatus('cancelled')).toBe(BatchStatus.CANCELLED);
  });
});

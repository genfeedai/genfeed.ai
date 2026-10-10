import { TurboRunStatus } from '@genfeedai/contracts';
import { TurboRunStatus as PrismaTurboRunStatus } from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';
import {
  fromPrismaTurboRunStatus,
  toPrismaTurboRunStatus,
} from './turbo-run-status-prisma.mapper';

describe('batch-status-prisma.mapper', () => {
  it('emits Prisma SCREAMING_SNAKE for every domain status', () => {
    for (const status of Object.values(TurboRunStatus)) {
      const prismaStatus = toPrismaTurboRunStatus(status);
      expect(Object.values(PrismaTurboRunStatus)).toContain(prismaStatus);
      expect(fromPrismaTurboRunStatus(prismaStatus)).toBe(
        // GENERATING is not a domain member — PROCESSING is the canonical name
        status === ('GENERATING' as TurboRunStatus)
          ? TurboRunStatus.PROCESSING
          : status,
      );
    }
  });

  it('round-trips every Prisma label', () => {
    for (const prismaStatus of Object.values(PrismaTurboRunStatus)) {
      expect(toPrismaTurboRunStatus(fromPrismaTurboRunStatus(prismaStatus))).toBe(
        prismaStatus,
      );
    }
  });

  it('accepts legacy lowercase domain spellings on write and read', () => {
    expect(toPrismaTurboRunStatus('pending')).toBe(PrismaTurboRunStatus.PENDING);
    expect(toPrismaTurboRunStatus('generating')).toBe(
      PrismaTurboRunStatus.PROCESSING,
    );
    expect(toPrismaTurboRunStatus('processing')).toBe(
      PrismaTurboRunStatus.PROCESSING,
    );
    expect(toPrismaTurboRunStatus('cancelled')).toBe(PrismaTurboRunStatus.CANCELLED);

    expect(fromPrismaTurboRunStatus('pending')).toBe(TurboRunStatus.PENDING);
    expect(fromPrismaTurboRunStatus('generating')).toBe(TurboRunStatus.PROCESSING);
    expect(fromPrismaTurboRunStatus('processing')).toBe(TurboRunStatus.PROCESSING);
    expect(fromPrismaTurboRunStatus('cancelled')).toBe(TurboRunStatus.CANCELLED);
  });

  it('always writes PENDING not pending (regression for stale enums dist)', () => {
    // Even if a stale package still exposes TurboRunStatus.PENDING === 'pending'
    expect(toPrismaTurboRunStatus('pending' as TurboRunStatus)).toBe('PENDING');
    expect(toPrismaTurboRunStatus(TurboRunStatus.PENDING)).toBe('PENDING');
  });
});

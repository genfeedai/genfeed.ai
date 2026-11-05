import type { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it } from 'vitest';
import { CronBrandedDispatchRecoveryService } from './cron.branded-dispatch-recovery.service';

type Receipts =
  BrandedGenerationReceiptsService['recoverExpiredDispatchesSystem'];
type ReceiptState = 'blocked' | 'resolved';

const NOW = new Date('2026-10-13T10:00:00.000Z');

/**
 * The sweep over an in-memory table of expired `resolved` receipts. A page
 * takes up to `limit` of them, minus excluded ids, and blocks each one, except
 * `poison` receipts, which it can never block and reports as skipped.
 */
function sweepOver(count: number, poison: string[] = []) {
  const receipts = new Map<string, ReceiptState>(
    [
      ...poison,
      ...Array.from({ length: count }, (_, index) => `receipt-${index}`),
    ].map((id) => [id, 'resolved']),
  );
  const pages: Array<{ excluded: number; now: Date | undefined }> = [];
  const logged: unknown[] = [];
  const recover: Receipts = async ({ excludeIds = [], limit, now }) => {
    pages.push({ excluded: excludeIds.length, now });
    const page = [...receipts]
      .filter(([id, state]) => state === 'resolved' && !excludeIds.includes(id))
      .slice(0, limit)
      .map(([id]) => id);
    const skipped = page.filter((id) => poison.includes(id));
    const blocked = page.filter((id) => !poison.includes(id));
    for (const id of blocked) {
      receipts.set(id, 'blocked');
    }
    return { blocked, skipped } as Awaited<ReturnType<Receipts>>;
  };
  const service = new CronBrandedDispatchRecoveryService(
    {
      log: (_message: string, totals: unknown) => {
        logged.push(totals);
      },
    } as unknown as LoggerService,
    {
      recoverExpiredDispatchesSystem: recover,
    } as unknown as BrandedGenerationReceiptsService,
  );
  const stillResolved = () =>
    [...receipts.values()].filter((state) => state === 'resolved').length;
  return { logged, pages, service, stillResolved };
}

describe('CronBrandedDispatchRecoveryService', () => {
  it('blocks expired receipts in one page and reports the totals', async () => {
    const { logged, pages, service, stillResolved } = sweepOver(2, ['poison']);

    await expect(service.recoverExpiredDispatches(NOW)).resolves.toEqual({
      blocked: 2,
      skipped: 1,
    });

    expect(pages).toEqual([{ excluded: 0, now: NOW }]);
    expect(stillResolved()).toBe(1);
    expect(logged).toEqual([
      {
        blocked: 2,
        context: 'CronBrandedDispatchRecoveryService',
        skipped: 1,
      },
    ]);
  });

  it('stays quiet when nothing expired', async () => {
    const { logged, service } = sweepOver(0);

    await expect(service.recoverExpiredDispatches(NOW)).resolves.toEqual({
      blocked: 0,
      skipped: 0,
    });
    expect(logged).toEqual([]);
  });

  it('pages through a backlog without re-reading a receipt it could not block', async () => {
    const { pages, service, stillResolved } = sweepOver(150, ['poison']);

    await expect(service.recoverExpiredDispatches(NOW)).resolves.toEqual({
      blocked: 150,
      skipped: 1,
    });

    expect(pages.map((page) => page.excluded)).toEqual([0, 1]);
    expect(stillResolved()).toBe(1);
  });

  it('stops after 20 pages and leaves the rest of a large backlog to the next run', async () => {
    const { pages, service, stillResolved } = sweepOver(2_500);

    await expect(service.recoverExpiredDispatches(NOW)).resolves.toEqual({
      blocked: 2_000,
      skipped: 0,
    });

    expect(pages).toHaveLength(20);
    expect(stillResolved()).toBe(500);
  });
});

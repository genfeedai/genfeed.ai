import type { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';
import { BRANDED_DISPATCH_RECOVERY_BATCH_SIZE } from './branded-dispatch-recovery.constants';
import { CronBrandedDispatchRecoveryService } from './cron.branded-dispatch-recovery.service';

const ids = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

function setup(pages: Array<{ blocked: string[]; skipped: string[] }>) {
  const recover = vi.fn();
  for (const page of pages) recover.mockResolvedValueOnce(page);
  recover.mockResolvedValue({ blocked: [], skipped: [] });
  const logger = { log: vi.fn() };
  const service = new CronBrandedDispatchRecoveryService(
    logger as unknown as LoggerService,
    {
      recoverExpiredDispatchesSystem: recover,
    } as unknown as BrandedGenerationReceiptsService,
  );
  return { logger, recover, service };
}

describe('CronBrandedDispatchRecoveryService', () => {
  it('blocks expired receipts and reports the totals', async () => {
    const { logger, recover, service } = setup([
      { blocked: ['r1', 'r2'], skipped: ['r3'] },
    ]);
    const now = new Date('2026-10-13T10:00:00.000Z');
    await expect(service.recoverExpiredDispatches(now)).resolves.toEqual({
      blocked: 2,
      skipped: 1,
    });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith({
      excludeIds: [],
      limit: BRANDED_DISPATCH_RECOVERY_BATCH_SIZE,
      now,
    });
    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when nothing expired', async () => {
    const { logger, service } = setup([]);
    await expect(service.recoverExpiredDispatches()).resolves.toEqual({
      blocked: 0,
      skipped: 0,
    });
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('pages through a backlog and never re-reads receipts it skipped', async () => {
    const full = ids('b', BRANDED_DISPATCH_RECOVERY_BATCH_SIZE - 1);
    const { recover, service } = setup([
      { blocked: full, skipped: ['poison'] },
      { blocked: ['tail'], skipped: [] },
    ]);
    const totals = await service.recoverExpiredDispatches();
    expect(totals).toEqual({ blocked: full.length + 1, skipped: 1 });
    expect(recover).toHaveBeenCalledTimes(2);
    expect(recover.mock.calls[1][0].excludeIds).toEqual(['poison']);
  });

  it('bounds one run to a fixed number of pages', async () => {
    const page = {
      blocked: ids('b', BRANDED_DISPATCH_RECOVERY_BATCH_SIZE),
      skipped: [],
    };
    const { recover, service } = setup(Array.from({ length: 50 }, () => page));
    await service.recoverExpiredDispatches();
    expect(recover).toHaveBeenCalledTimes(20);
  });
});

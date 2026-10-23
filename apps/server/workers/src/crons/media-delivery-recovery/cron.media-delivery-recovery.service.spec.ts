import { MediaKeyRepairService } from '@api/services/media-urls/media-key-repair.service';
import { MediaVariantRecoveryService } from '@api/services/media-urls/media-variant-recovery.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { CronMediaDeliveryRecoveryService } from '@workers/crons/media-delivery-recovery/cron.media-delivery-recovery.service';

const idleVariants = { exhausted: 0, requeued: 0, retried: 0 };
const idleKeys = { failed: 0, lastId: null, missing: 0, repaired: 0 };

async function setup() {
  const variantRecovery = {
    recover: vi.fn().mockResolvedValue(idleVariants),
  };
  const keyRepair = { repairBatch: vi.fn().mockResolvedValue(idleKeys) };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const module = await Test.createTestingModule({
    providers: [
      CronMediaDeliveryRecoveryService,
      { provide: MediaVariantRecoveryService, useValue: variantRecovery },
      { provide: MediaKeyRepairService, useValue: keyRepair },
      { provide: LoggerService, useValue: logger },
    ],
  }).compile();
  return {
    keyRepair,
    logger,
    service: module.get(CronMediaDeliveryRecoveryService),
    variantRecovery,
  };
}

describe('CronMediaDeliveryRecoveryService', () => {
  it('runs variant recovery and one key repair batch per tick', async () => {
    const { service, variantRecovery, keyRepair } = await setup();
    const now = new Date('2026-10-23T12:00:00.000Z');
    await expect(service.recoverMedia(now)).resolves.toEqual({
      keys: idleKeys,
      variants: idleVariants,
    });
    expect(variantRecovery.recover).toHaveBeenCalledExactlyOnceWith(now);
    expect(keyRepair.repairBatch).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('advances the key cursor and wraps around after an empty batch', async () => {
    const { service, keyRepair } = await setup();
    keyRepair.repairBatch
      .mockResolvedValueOnce({ ...idleKeys, lastId: 'ingredient-25' })
      .mockResolvedValueOnce(idleKeys);
    await service.recoverMedia();
    await service.recoverMedia();
    await service.recoverMedia();
    expect(keyRepair.repairBatch.mock.calls.map(([cursor]) => cursor)).toEqual([
      null,
      'ingredient-25',
      null,
    ]);
  });

  it('logs only when a sweep changed something', async () => {
    const { service, logger, variantRecovery } = await setup();
    await service.recoverMedia();
    expect(logger.log).not.toHaveBeenCalled();
    variantRecovery.recover.mockResolvedValue({ ...idleVariants, requeued: 2 });
    await service.recoverMedia();
    expect(logger.log).toHaveBeenCalledOnce();
  });

  it('surfaces a recovery failure to the scheduler', async () => {
    const { service, variantRecovery, keyRepair } = await setup();
    variantRecovery.recover.mockRejectedValue(new Error('db down'));
    await expect(service.recoverMedia()).rejects.toThrow('db down');
    expect(keyRepair.repairBatch).not.toHaveBeenCalled();
  });
});

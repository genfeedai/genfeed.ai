import type { MediaKeyRepairTotals } from '@api/services/media-urls/media-key-repair.service';
import { MediaKeyRepairService } from '@api/services/media-urls/media-key-repair.service';
import type { MediaVariantRecoveryTotals } from '@api/services/media-urls/media-variant-recovery.service';
import { MediaVariantRecoveryService } from '@api/services/media-urls/media-variant-recovery.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type MediaDeliveryRecoveryTotals = {
  keys: MediaKeyRepairTotals;
  variants: MediaVariantRecoveryTotals;
};

/**
 * Heals saved assets that show "Preview unavailable".
 *
 * Each tick re-drives derivative variants the render queue dropped and repairs
 * one bounded batch of IMAGE/VIDEO ingredients with a missing or URL-shaped
 * storage key. The key sweep walks ingredient ids with an in-memory cursor and
 * wraps around once it reaches the end, so rows whose object is genuinely gone
 * cannot starve the rest. The platform schedule runs one job per tick across
 * the deployment, which is the distributed lock.
 */
@Injectable()
export class CronMediaDeliveryRecoveryService {
  private readonly context = 'CronMediaDeliveryRecoveryService';
  private keyCursor: string | null = null;

  constructor(
    private readonly variantRecovery: MediaVariantRecoveryService,
    private readonly keyRepair: MediaKeyRepairService,
    private readonly logger: LoggerService,
  ) {}

  async recoverMedia(now = new Date()): Promise<MediaDeliveryRecoveryTotals> {
    const variants = await this.variantRecovery.recover(now);
    const keys = await this.keyRepair.repairBatch(this.keyCursor);
    this.keyCursor = keys.lastId;

    const hasWork =
      variants.exhausted + variants.requeued + variants.retried > 0 ||
      keys.repaired + keys.missing + keys.failed > 0;
    if (hasWork) {
      this.logger.log('Media delivery recovery sweep finished', {
        context: this.context,
        keys,
        variants,
      });
    }
    return { keys, variants };
  }
}

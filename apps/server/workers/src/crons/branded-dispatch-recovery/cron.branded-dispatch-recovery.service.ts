import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import {
  BRANDED_DISPATCH_RECOVERY_BATCH_SIZE,
  BRANDED_DISPATCH_RECOVERY_MAX_PAGES,
} from '@workers/crons/branded-dispatch-recovery/branded-dispatch-recovery.constants';

export interface BrandedDispatchRecoveryTotals {
  blocked: number;
  skipped: number;
}

/**
 * Blocks branded generation receipts that stayed `resolved` past the dispatch
 * window (#5786). Such a request never reached its provider, so the receipt can
 * never complete; until it is blocked its request key answers "in progress"
 * forever. The sweep never retries and never dispatches.
 */
@Injectable()
export class CronBrandedDispatchRecoveryService {
  private readonly context = 'CronBrandedDispatchRecoveryService';

  constructor(
    private readonly logger: LoggerService,
    private readonly receipts: BrandedGenerationReceiptsService,
  ) {}

  async recoverExpiredDispatches(
    now = new Date(),
  ): Promise<BrandedDispatchRecoveryTotals> {
    const skipped: string[] = [];
    let blocked = 0;

    for (let page = 0; page < BRANDED_DISPATCH_RECOVERY_MAX_PAGES; page += 1) {
      const result = await this.receipts.recoverExpiredDispatchesSystem({
        excludeIds: [...skipped],
        limit: BRANDED_DISPATCH_RECOVERY_BATCH_SIZE,
        now,
      });
      blocked += result.blocked.length;
      skipped.push(...result.skipped);
      if (
        result.blocked.length + result.skipped.length <
        BRANDED_DISPATCH_RECOVERY_BATCH_SIZE
      )
        break;
    }

    const totals = { blocked, skipped: skipped.length };
    if (totals.blocked > 0 || totals.skipped > 0)
      this.logger.log('CronBrandedDispatchRecoveryService completed', {
        ...totals,
        context: this.context,
      });
    return totals;
  }
}

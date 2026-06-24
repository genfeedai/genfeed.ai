import {
  BotsLivestreamService,
  type LivestreamBotProcessingResult,
} from '@api/collections/bots/services/bots-livestream.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { Injectable } from '@nestjs/common';

const LIVESTREAM_BOT_LOCK_TTL_SECONDS = 60;

@Injectable()
export class LivestreamBotWorkflowService {
  constructor(
    private readonly botsLivestreamService: BotsLivestreamService,
    private readonly cacheService: CacheService,
  ) {}

  async runActiveSessionProcessing(
    organizationId: string,
  ): Promise<LivestreamBotProcessingResult> {
    const action = 'livestreamBotSessionProcessing';
    const lockKey = `${action}:${organizationId}`;
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      LIVESTREAM_BOT_LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      return {
        action,
        failed: 0,
        organizationId,
        processed: 0,
        reason: 'livestream_bot_processing_locked',
        sessions: 0,
        skipped: 1,
        status: 'skipped',
      };
    }

    try {
      return await this.botsLivestreamService.processActiveSessionsForOrganization(
        organizationId,
      );
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }
}

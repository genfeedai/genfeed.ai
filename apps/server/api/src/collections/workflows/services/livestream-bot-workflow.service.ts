import { BotsService } from '@api/collections/bots/services/bots.service';
import {
  BotsLivestreamService,
  type LivestreamBotProcessingResult,
} from '@api/collections/bots/services/bots-livestream.service';
import { BotsRestreamChatService } from '@api/collections/bots/services/bots-restream-chat.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { Injectable, Optional } from '@nestjs/common';

const LIVESTREAM_BOT_LOCK_TTL_SECONDS = 60;

@Injectable()
export class LivestreamBotWorkflowService {
  constructor(
    private readonly botsLivestreamService: BotsLivestreamService,
    private readonly cacheService: CacheService,
    @Optional() private readonly botsService?: BotsService,
    @Optional() private readonly restreamChatService?: BotsRestreamChatService,
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

  /**
   * Workflow node: restreamChatIngest — pull Restream Chat into a livestream bot session.
   */
  async runRestreamChatIngest(
    organizationId: string,
    botId: string,
  ): Promise<Record<string, unknown>> {
    if (!this.botsService || !this.restreamChatService) {
      return {
        action: 'restreamChatIngest',
        ingested: 0,
        organizationId,
        reason: 'restream_chat_service_unavailable',
        status: 'skipped',
      };
    }

    const bot = await this.botsService.findOne({
      id: botId,
      isDeleted: false,
      organizationId,
    } as never);

    if (!bot) {
      return {
        action: 'restreamChatIngest',
        botId,
        ingested: 0,
        organizationId,
        reason: 'bot_not_found',
        status: 'failed',
      };
    }

    const result = await this.restreamChatService.syncActiveSessionChat(bot);
    return {
      action: 'restreamChatIngest',
      botId,
      ...result,
      organizationId,
      status: result.ingested > 0 ? 'completed' : 'skipped',
    };
  }
}

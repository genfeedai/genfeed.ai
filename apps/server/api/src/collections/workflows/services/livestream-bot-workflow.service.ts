import { BotsService } from '@api/collections/bots/services/bots.service';
import {
  BotsLivestreamService,
  type LivestreamBotProcessingResult,
} from '@api/collections/bots/services/bots-livestream.service';
import { BotsRestreamChatService } from '@api/collections/bots/services/bots-restream-chat.service';
import { CacheService } from '@server/services/cache/cache.service';
import { Injectable, Optional, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

const LIVESTREAM_BOT_LOCK_TTL_SECONDS = 60;

@Injectable()
export class LivestreamBotWorkflowService {
  constructor(
    @Optional()
    private readonly botsLivestreamService: BotsLivestreamService | undefined,
    private readonly cacheService: CacheService,
    @Optional() private readonly botsService?: BotsService,
    @Optional() private readonly restreamChatService?: BotsRestreamChatService,
    @Optional() private readonly moduleRef?: ModuleRef,
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
      const botsLivestreamService = this.resolveProvider(
        this.botsLivestreamService,
        BotsLivestreamService,
      );
      if (!botsLivestreamService) {
        return {
          action,
          failed: 0,
          organizationId,
          processed: 0,
          reason: 'livestream_bot_service_unavailable',
          sessions: 0,
          skipped: 1,
          status: 'skipped',
        };
      }
      return await botsLivestreamService.processActiveSessionsForOrganization(
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
    const botsService = this.resolveProvider(this.botsService, BotsService);
    const restreamChatService = this.resolveProvider(
      this.restreamChatService,
      BotsRestreamChatService,
    );
    if (!botsService || !restreamChatService) {
      return {
        action: 'restreamChatIngest',
        ingested: 0,
        organizationId,
        reason: 'restream_chat_service_unavailable',
        status: 'skipped',
      };
    }

    const bot = await botsService.findOne({
      id: botId,
      isDeleted: false,
      organizationId,
    });

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

    const result = await restreamChatService.syncActiveSessionChat(bot);
    return {
      action: 'restreamChatIngest',
      botId,
      ...result,
      organizationId,
      status: result.ingested > 0 ? 'completed' : 'skipped',
    };
  }

  private resolveProvider<T>(
    direct: T | undefined,
    token: Type<T>,
  ): T | undefined {
    if (direct) {
      return direct;
    }
    try {
      return this.moduleRef?.get(token, { strict: false });
    } catch {
      return undefined;
    }
  }
}

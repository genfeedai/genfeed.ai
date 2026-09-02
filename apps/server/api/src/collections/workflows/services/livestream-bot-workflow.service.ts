import type { BotDocument } from '@api/collections/bots/schemas/bot.schema';
import type { LivestreamBotSessionDocument } from '@api/collections/bots/schemas/livestream-bot-session.schema';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { BotsRestreamChatService } from '@api/collections/bots/services/bots-restream-chat.service';
import { AUTOMATION_WORKFLOW_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import { CacheService } from '@api/services/cache/cache.service';
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

  async beginActiveSessionProcessing(
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const lockKey = `${AUTOMATION_WORKFLOW_IDS.LIVESTREAM_SESSIONS}:${organizationId}`;
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      LIVESTREAM_BOT_LOCK_TTL_SECONDS,
    );
    return { acquired, lockKey, organizationId };
  }

  async discoverActiveSessions(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.readRecord(input.state).acquired !== true)
      return { baseInput: { organizationId }, items: [] };
    const service = this.requireLivestreamService();
    const items =
      await service.discoverActiveSessionsForOrganization(organizationId);
    return { baseInput: { organizationId }, items };
  }

  async loadActiveSession(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const session = this.readRecord(
      input.item,
    ) as unknown as LivestreamBotSessionDocument;
    try {
      return await this.requireLivestreamService().loadActiveSessionContext(
        organizationId,
        session,
      );
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        sessionId: session.id,
        status: 'failed',
      };
    }
  }

  async syncActiveSessionRestream(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const state = this.readRecord(input.state);
    try {
      return await this.requireLivestreamService().syncActiveSessionRestream(
        state,
      );
    } catch (error) {
      return {
        ...state,
        error: error instanceof Error ? error.message : String(error),
        status: 'failed',
      };
    }
  }

  discoverActiveSessionTargets(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const state = this.readRecord(input.state);
    try {
      return this.requireLivestreamService().discoverActiveSessionTargets(
        state,
      );
    } catch (error) {
      return {
        ...state,
        baseInput: {},
        error: error instanceof Error ? error.message : String(error),
        items: [],
        status: 'failed',
      };
    }
  }

  async deliverActiveSessionTarget(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.requireLivestreamService().deliverActiveSessionTarget(
        organizationId,
        input,
      );
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        status: 'failed',
      };
    }
  }

  finalizeActiveSession(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const state = this.readRecord(input.state);
    const results = this.readBatchResults(input.batch).map((entry) =>
      this.readRecord(entry.result),
    );
    return {
      sessionId: state.sessionId,
      status:
        state.status === 'failed' ||
        results.some((result) => result.status === 'failed')
          ? 'failed'
          : state.status === 'loaded' ||
              results.some((result) => result.status === 'processed')
            ? 'processed'
            : 'skipped',
      targets: results.length,
    };
  }

  async finalizeActiveSessionProcessing(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const state = this.readRecord(input.state);
    const results = this.readBatchResults(input.batch).map((entry) =>
      this.readRecord(entry.result),
    );
    if (state.acquired === true)
      await this.cacheService.releaseLock(
        `${AUTOMATION_WORKFLOW_IDS.LIVESTREAM_SESSIONS}:${organizationId}`,
      );
    if (state.acquired !== true) {
      return {
        action: AUTOMATION_WORKFLOW_IDS.LIVESTREAM_SESSIONS,
        failed: 0,
        organizationId,
        processed: 0,
        reason: 'livestream_bot_processing_locked',
        sessions: 0,
        skipped: 1,
        status: 'skipped',
      };
    }
    return {
      action: AUTOMATION_WORKFLOW_IDS.LIVESTREAM_SESSIONS,
      failed: results.filter((result) => result.status === 'failed').length,
      organizationId,
      processed: results.filter((result) => result.status === 'processed')
        .length,
      ...(results.length === 0
        ? { reason: 'no_active_livestream_sessions' }
        : {}),
      sessions: results.length,
      skipped:
        results.length === 0
          ? 1
          : results.filter((result) => result.status === 'skipped').length,
      status: results.length === 0 ? 'skipped' : 'completed',
    };
  }

  async failActiveSessionProcessing(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const acquired = this.readRecord(input.state).acquired === true;
    if (acquired)
      await this.cacheService.releaseLock(
        `${AUTOMATION_WORKFLOW_IDS.LIVESTREAM_SESSIONS}:${organizationId}`,
      );
    return { organizationId, released: acquired };
  }

  async loadRestreamBot(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const botsService = this.resolveProvider(this.botsService, BotsService);
    if (!botsService) throw new Error('BotsService is unavailable');
    const request = this.readRecord(input.request);
    const botId = this.requiredString(request.botId ?? input.botId, 'botId');

    const bot = await botsService.findOne({
      id: botId,
      isDeleted: false,
      organizationId,
    });

    if (!bot) {
      return {
        botId,
        organizationId,
        reason: 'bot_not_found',
        status: 'skipped',
      };
    }
    return { bot, botId, organizationId, status: 'loaded' };
  }

  async syncRestreamChat(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const state = this.readRecord(input.state);
    if (state.status !== 'loaded') return state;
    const service = this.resolveProvider(
      this.restreamChatService,
      BotsRestreamChatService,
    );
    if (!service) throw new Error('BotsRestreamChatService is unavailable');
    const result = await service.syncActiveSessionChat(
      state.bot as BotDocument,
    );
    return {
      ...state,
      ...result,
      status: result.ingested > 0 ? 'completed' : 'skipped',
    };
  }

  finalizeRestreamChat(
    organizationId: string,
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const loaded = this.readRecord(input.loaded);
    const synced = this.readRecord(input.synced);
    const reason = loaded.reason ?? synced.reason;
    return {
      action: AUTOMATION_WORKFLOW_IDS.LIVESTREAM_RESTREAM,
      botId: loaded.botId,
      ingested: typeof synced.ingested === 'number' ? synced.ingested : 0,
      organizationId,
      ...(reason !== undefined ? { reason } : {}),
      status: synced.status ?? loaded.status ?? 'skipped',
    };
  }

  private requireLivestreamService(): BotsLivestreamService {
    const service = this.resolveProvider(
      this.botsLivestreamService,
      BotsLivestreamService,
    );
    if (!service) throw new Error('BotsLivestreamService is unavailable');
    return service;
  }

  private readBatchResults(value: unknown): Array<{ result?: unknown }> {
    const batch = this.readRecord(value);
    return Array.isArray(batch.results)
      ? (batch.results as Array<{ result?: unknown }>)
      : [];
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0)
      throw new Error(`${field} is required`);
    return value;
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

import type { BotDocument } from '@api/collections/bots/schemas/bot.schema';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RestreamService } from '@api/services/integrations/restream/services/restream.service';
import { LivestreamTranscriptSource, Platform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common';

/**
 * Restream Chat WebSocket action (subset). The official API is one-way
 * server → client at wss://chat.api.restream.io/ws?accessToken=…
 * @see https://developers.restream.io/chat/getting-started
 */
export interface RestreamChatAction {
  action?: string;
  author?: {
    displayName?: string;
    id?: string;
    name?: string;
  };
  eventPayload?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  text?: string;
  timestamp?: number | string;
  [key: string]: unknown;
}

export interface RestreamChatIngestResult {
  ingested: number;
  sessionId: string | null;
  skipped: number;
}

/**
 * Restream-first livestream context path (no OBS).
 *
 * Chat: official Restream Chat WS unifies YouTube/Twitch/… messages.
 * Host speech: Restream does not expose a public live host-transcript API —
 * use EXTERNAL_CAPTION_WEBHOOK (SyncWords/Deepgram → Genfeed) or MANUAL /
 * AUDIO_URL while the encoder feeds Restream Studio.
 */
@Injectable()
export class BotsRestreamChatService {
  private readonly logContext = 'BotsRestreamChatService';

  constructor(
    @Inject(forwardRef(() => BotsLivestreamService))
    private readonly botsLivestreamService: BotsLivestreamService,
    private readonly logger: LoggerService,
    @Optional() private readonly restreamService?: RestreamService,
    @Optional() private readonly credentialsService?: CredentialsService,
  ) {}

  /**
   * WebSocket URL for Restream Chat. Token is never logged.
   */
  buildChatWebSocketUrl(accessToken: string): string {
    const token = accessToken.trim();
    if (!token) {
      throw new Error('Restream access token is required');
    }
    return `wss://chat.api.restream.io/ws?accessToken=${encodeURIComponent(token)}`;
  }

  /**
   * Extract human-readable chat text from a Restream action payload.
   * Restream event shapes vary by platform source — keep parsing defensive.
   */
  extractChatText(action: RestreamChatAction): string | null {
    if (typeof action.text === 'string' && action.text.trim()) {
      return action.text.trim();
    }

    const payload = action.payload ?? action.eventPayload;
    if (payload && typeof payload === 'object') {
      for (const key of ['text', 'message', 'content', 'body'] as const) {
        const value = payload[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }

    return null;
  }

  extractAuthorLabel(action: RestreamChatAction): string | null {
    const name =
      action.author?.displayName ||
      action.author?.name ||
      (typeof action.payload?.authorName === 'string'
        ? action.payload.authorName
        : null);
    return name?.trim() || null;
  }

  isLikelyChatMessage(action: RestreamChatAction): boolean {
    const actionName = String(action.action || '').toLowerCase();
    if (
      actionName.includes('event') ||
      actionName.includes('message') ||
      actionName.includes('chat') ||
      actionName === ''
    ) {
      return Boolean(this.extractChatText(action));
    }
    return Boolean(this.extractChatText(action));
  }

  /**
   * Batch-ingest Restream chat actions as rolling context for the livestream
   * bot (same storage as transcript chunks — audience signal, not host mic).
   */
  async ingestChatActions(
    bot: BotDocument,
    actions: RestreamChatAction[],
  ): Promise<RestreamChatIngestResult> {
    let ingested = 0;
    let skipped = 0;
    let sessionId: string | null = null;

    for (const action of actions) {
      if (!this.isLikelyChatMessage(action)) {
        skipped += 1;
        continue;
      }

      const text = this.extractChatText(action);
      if (!text) {
        skipped += 1;
        continue;
      }

      const author = this.extractAuthorLabel(action);
      const chunkText = author ? `${author}: ${text}` : text;

      try {
        const session = await this.botsLivestreamService.ingestTranscriptChunk(
          bot,
          {
            confidence: 0.9,
            language: undefined,
            prompt: 'restream_chat',
            text: chunkText,
          },
        );
        sessionId = String(session.id ?? sessionId ?? '');
        ingested += 1;
      } catch (error) {
        skipped += 1;
        this.logger.warn('Failed to ingest Restream chat action', {
          context: this.logContext,
          error,
        });
      }
    }

    return { ingested, sessionId, skipped };
  }

  resolveTranscriptSource(bot: BotDocument): LivestreamTranscriptSource {
    const raw = bot.livestreamSettings?.transcriptSource;
    if (
      typeof raw === 'string' &&
      Object.values(LivestreamTranscriptSource).includes(
        raw as LivestreamTranscriptSource,
      )
    ) {
      return raw as LivestreamTranscriptSource;
    }
    return LivestreamTranscriptSource.MANUAL;
  }

  /**
   * Pull Restream Chat for a short window and ingest into the livestream session.
   * Called from minute-cadence session processing when transcriptSource is restream_chat.
   */
  async syncActiveSessionChat(
    bot: BotDocument,
  ): Promise<RestreamChatIngestResult> {
    const source = this.resolveTranscriptSource(bot);
    if (
      source !== LivestreamTranscriptSource.RESTREAM_CHAT ||
      bot.livestreamSettings?.transcriptEnabled === false
    ) {
      return { ingested: 0, sessionId: null, skipped: 1 };
    }

    if (!this.restreamService || !this.credentialsService) {
      this.logger.warn(
        'Restream services unavailable for chat sync',
        this.logContext,
      );
      return { ingested: 0, sessionId: null, skipped: 1 };
    }

    const accessToken = await this.resolveRestreamAccessToken(bot);
    if (!accessToken) {
      return { ingested: 0, sessionId: null, skipped: 1 };
    }

    try {
      const frames = await this.restreamService.collectChatActions(
        accessToken,
        {
          listenMs: 6_000,
          maxMessages: 30,
        },
      );
      return this.ingestChatActions(bot, frames as RestreamChatAction[]);
    } catch (error) {
      this.logger.warn('Restream chat sync failed', {
        context: this.logContext,
        error,
      });
      return { ingested: 0, sessionId: null, skipped: 1 };
    }
  }

  private async resolveRestreamAccessToken(
    bot: BotDocument,
  ): Promise<string | null> {
    if (!this.credentialsService) {
      return null;
    }

    const credentialId = bot.livestreamSettings?.restreamCredentialId;
    if (credentialId) {
      const byId = await this.credentialsService.findOne({
        id: credentialId,
        organizationId: bot.organizationId,
        isDeleted: false,
      } as never);
      const token = readAccessToken(byId);
      if (token) {
        return token;
      }
    }

    // Brand-scoped Restream credential fallback.
    if (bot.brandId) {
      const byBrand = await this.credentialsService.findOne({
        brandId: bot.brandId,
        isConnected: true,
        isDeleted: false,
        organizationId: bot.organizationId,
        platform: Platform.RESTREAM,
      } as never);
      return readAccessToken(byBrand);
    }

    return null;
  }
}

function readAccessToken(credential: unknown): string | null {
  if (!credential || typeof credential !== 'object') {
    return null;
  }
  const record = credential as Record<string, unknown>;
  const token = record.accessToken ?? record.access_token;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

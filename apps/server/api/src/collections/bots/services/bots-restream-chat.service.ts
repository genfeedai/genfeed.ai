import type { BotDocument } from '@api/collections/bots/schemas/bot.schema';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { LivestreamTranscriptSource } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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
    private readonly botsLivestreamService: BotsLivestreamService,
    private readonly logger: LoggerService,
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
    return bot.livestreamSettings?.transcriptEnabled === false
      ? LivestreamTranscriptSource.MANUAL
      : LivestreamTranscriptSource.MANUAL;
  }
}

import { BOTS_LIVESTREAM_SERVICE } from '@api/collections/bots/bots.tokens';
import type { UpdateBotDto } from '@api/collections/bots/dto/update-bot.dto';
import type { BotDocument } from '@api/collections/bots/schemas/bot.schema';
import { BotsService } from '@api/collections/bots/services/bots.service';
import type { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RestreamService } from '@api/services/integrations/restream/services/restream.service';
import {
  pickAccessTokenAfterRefresh,
  resolveRestreamAccessFromCredential,
} from '@api/services/integrations/restream/services/restream-token.util';
import {
  CredentialPlatform,
  LivestreamTranscriptSource,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

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
    @Inject(BOTS_LIVESTREAM_SERVICE)
    private readonly botsLivestreamService: BotsLivestreamService,
    private readonly logger: LoggerService,
    @Optional() private readonly restreamService?: RestreamService,
    @Optional() private readonly credentialsService?: CredentialsService,
    @Optional()
    @Inject(forwardRef(() => BotsService))
    private readonly botsService?: BotsService,
    @Optional() private readonly moduleRef?: ModuleRef,
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

    const restreamService = this.resolveRestreamService();
    if (!restreamService || !this.credentialsService) {
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
      const frames = await restreamService.collectChatActions(accessToken, {
        listenMs: 6_000,
        maxMessages: 30,
      });
      return this.ingestChatActions(bot, frames as RestreamChatAction[]);
    } catch (error) {
      // Collect can fail on expired tokens even when expiry was not stored —
      // retry once after forced refresh.
      const retried = await this.resolveRestreamAccessToken(bot, {
        forceRefresh: true,
      });
      if (retried && retried !== accessToken) {
        try {
          const frames = await restreamService.collectChatActions(retried, {
            listenMs: 6_000,
            maxMessages: 30,
          });
          return this.ingestChatActions(bot, frames as RestreamChatAction[]);
        } catch (retryError) {
          this.logger.warn('Restream chat sync failed after token refresh', {
            context: this.logContext,
            error: retryError,
          });
          return { ingested: 0, sessionId: null, skipped: 1 };
        }
      }

      this.logger.warn('Restream chat sync failed', {
        context: this.logContext,
        error,
      });
      return { ingested: 0, sessionId: null, skipped: 1 };
    }
  }

  /**
   * Resolve a usable Restream access token for the bot, refreshing when stale
   * or when forceRefresh is set (e.g. after a collect failure).
   */
  async resolveRestreamAccessToken(
    bot: BotDocument,
    options: { forceRefresh?: boolean; now?: Date } = {},
  ): Promise<string | null> {
    const restreamService = this.resolveRestreamService();
    if (!this.credentialsService || !restreamService) {
      return null;
    }

    const credential = await this.loadRestreamCredential(bot);
    if (!credential) {
      return null;
    }

    const tokens = readCredentialTokens(credential);
    const resolved = resolveRestreamAccessFromCredential(
      tokens,
      options.now ?? new Date(),
    );
    if (!resolved) {
      return null;
    }

    if (!resolved.needsRefresh && !options.forceRefresh) {
      return resolved.accessToken || null;
    }

    if (!resolved.refreshToken) {
      return resolved.accessToken || null;
    }

    try {
      const refreshed = await restreamService.refreshAccessToken(
        resolved.refreshToken,
      );
      const nextToken = pickAccessTokenAfterRefresh(
        refreshed,
        resolved.accessToken,
      );
      if (!nextToken) {
        return resolved.accessToken || null;
      }

      if (tokens.id && this.credentialsService.patch) {
        await this.credentialsService.patch(tokens.id, {
          accessToken: nextToken,
          accessTokenExpiry: refreshed.expires_in
            ? new Date(Date.now() + refreshed.expires_in * 1000)
            : undefined,
          ...(refreshed.refresh_token
            ? { refreshToken: refreshed.refresh_token }
            : {}),
        });
      }

      return nextToken;
    } catch (error) {
      this.logger.warn('Restream token refresh failed', {
        context: this.logContext,
        error,
      });
      return resolved.accessToken || null;
    }
  }

  private resolveRestreamService(): RestreamService | undefined {
    if (this.restreamService) {
      return this.restreamService;
    }
    try {
      return this.moduleRef?.get(RestreamService, { strict: false });
    } catch {
      return undefined;
    }
  }

  private async loadRestreamCredential(
    bot: BotDocument,
  ): Promise<Record<string, unknown> | null> {
    if (!this.credentialsService) {
      return null;
    }

    const credentialId = bot.livestreamSettings?.restreamCredentialId;
    if (credentialId) {
      const byId = await this.credentialsService.findOne({
        id: credentialId,
        isDeleted: false,
        organizationId: bot.organizationId,
      });
      if (byId) {
        return byId as Record<string, unknown>;
      }
    }

    if (bot.brandId) {
      // Discovery only — a brand with several Restream accounts gets its
      // default one, and the id is pinned onto the bot below so every later
      // load addresses that account explicitly.
      const byBrand = await this.credentialsService.resolveBrandAccount({
        brandId: bot.brandId,
        organizationId: bot.organizationId,
        platform: CredentialPlatform.RESTREAM,
      });
      if (byBrand) {
        const resolvedId =
          typeof (byBrand as { id?: unknown }).id === 'string'
            ? (byBrand as { id: string }).id
            : undefined;
        // Persist brand RESTREAM credential onto the bot so later loads skip discovery.
        if (
          resolvedId &&
          bot.id &&
          !bot.livestreamSettings?.restreamCredentialId
        ) {
          await this.bindRestreamCredentialId(bot, resolvedId);
        }
        return byBrand as Record<string, unknown>;
      }
    }

    return null;
  }

  /**
   * Best-effort durable bind of brand RESTREAM OAuth credential to livestream settings.
   * Failures are logged and ignored — runtime already has the credential for this call.
   */
  private async bindRestreamCredentialId(
    bot: BotDocument,
    restreamCredentialId: string,
  ): Promise<void> {
    if (!this.botsService || !bot.id) {
      return;
    }

    try {
      const existingSettings =
        bot.livestreamSettings && typeof bot.livestreamSettings === 'object'
          ? { ...bot.livestreamSettings }
          : {};

      const transcriptSource =
        typeof existingSettings.transcriptSource === 'string' &&
        Object.values(LivestreamTranscriptSource).includes(
          existingSettings.transcriptSource as LivestreamTranscriptSource,
        )
          ? (existingSettings.transcriptSource as LivestreamTranscriptSource)
          : LivestreamTranscriptSource.RESTREAM_CHAT;

      const nextSettings = {
        ...existingSettings,
        restreamCredentialId,
        transcriptSource,
      };

      await this.botsService.patch(bot.id, {
        // Document shape is wider than the write DTO; patch replaces the config key.
        livestreamSettings: nextSettings as UpdateBotDto['livestreamSettings'],
      });

      // Keep in-memory bot consistent for the rest of this request.
      bot.livestreamSettings = nextSettings;
    } catch (error) {
      this.logger.warn('Failed to auto-bind restreamCredentialId on bot', {
        botId: bot.id,
        context: this.logContext,
        error,
        restreamCredentialId,
      });
    }
  }
}

function readCredentialTokens(credential: Record<string, unknown>): {
  accessToken: string | null;
  accessTokenExpiry?: Date | string | null;
  id?: string;
  refreshToken?: string | null;
} {
  const accessRaw =
    typeof credential.accessToken === 'string'
      ? credential.accessToken
      : typeof credential.access_token === 'string'
        ? credential.access_token
        : null;
  const refreshRaw =
    typeof credential.refreshToken === 'string'
      ? credential.refreshToken
      : typeof credential.refresh_token === 'string'
        ? credential.refresh_token
        : null;
  const expiry =
    credential.accessTokenExpiry ?? credential.access_token_expiry ?? null;

  // CredentialsService encrypts secrets at rest — decrypt for Restream API use.
  // EncryptionUtil is idempotent for plaintext fixtures used in unit tests.
  const accessToken =
    accessRaw != null && accessRaw !== ''
      ? EncryptionUtil.decrypt(accessRaw)
      : accessRaw;
  const refreshToken =
    refreshRaw != null && refreshRaw !== ''
      ? EncryptionUtil.decrypt(refreshRaw)
      : refreshRaw;

  return {
    accessToken:
      typeof accessToken === 'string' && accessToken.trim()
        ? accessToken.trim()
        : accessToken === ''
          ? ''
          : null,
    accessTokenExpiry:
      expiry instanceof Date || typeof expiry === 'string' || expiry == null
        ? (expiry as Date | string | null)
        : null,
    id: typeof credential.id === 'string' ? credential.id : undefined,
    refreshToken:
      typeof refreshToken === 'string' && refreshToken.trim()
        ? refreshToken.trim()
        : refreshToken === ''
          ? ''
          : null,
  };
}

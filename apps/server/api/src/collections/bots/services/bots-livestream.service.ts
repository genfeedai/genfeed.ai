import { randomUUID } from 'node:crypto';

import type {
  BotDocument,
  BotLivestreamMessageTemplate,
  BotLivestreamMessageType,
  BotTarget,
} from '@api/collections/bots/schemas/bot.schema';
import type {
  LivestreamBotSessionDocument,
  LivestreamDeliveryRecord,
  LivestreamPlatformState,
  LivestreamSessionContext,
  LivestreamTranscriptChunk,
} from '@api/collections/bots/schemas/livestream-bot-session.schema';
import { ConfigService } from '@api/config/config.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BotPlatform } from '@genfeedai/enums';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { BotsLivestreamDeliveryService } from './bots-livestream-delivery.service';
import {
  BotsLivestreamRuntimeService,
  type LivestreamMessageTemplate,
  type LivestreamPlatform,
  type ResolvedLivestreamContext,
} from './bots-livestream-runtime.service';

type LivestreamMessageType = BotLivestreamMessageType;

interface TranscriptPayload {
  audioUrl?: string;
  confidence?: number;
  language?: string;
  prompt?: string;
  text?: string;
}

interface ManualOverridePayload {
  activeLinkId?: string;
  promotionAngle?: string;
  topic?: string;
}

interface SendNowPayload {
  message?: string;
  platform: LivestreamPlatform;
  type?: LivestreamMessageType;
}

function isLivestreamPlatform(
  platform: string,
): platform is LivestreamPlatform {
  return platform === BotPlatform.TWITCH || platform === BotPlatform.YOUTUBE;
}

function isLivestreamMessageType(
  messageType: string,
): messageType is LivestreamMessageType {
  return (
    messageType === 'scheduled_link_drop' ||
    messageType === 'scheduled_host_prompt' ||
    messageType === 'context_aware_question'
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeLegacyPayload(
  target: Record<string, unknown>,
  source: unknown,
): void {
  if (!isPlainObject(source)) {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    if (target[key] === undefined) {
      target[key] = value;
    }
  }
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toJsonCompatible(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonCompatible(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, toJsonCompatible(entryValue)]),
    );
  }

  return value;
}

function mergeSessionContext(
  current: LivestreamSessionContext | undefined,
  patch: Partial<LivestreamSessionContext>,
): LivestreamSessionContext {
  return {
    ...(current ?? { source: 'none' }),
    ...patch,
    source: patch.source ?? current?.source ?? 'none',
  };
}

@Injectable()
export class BotsLivestreamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryService: BotsLivestreamDeliveryService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly replicateService: ReplicateService,
    private readonly runtimeService: BotsLivestreamRuntimeService,
  ) {}

  private normalizeBotDocument(bot: BotDocument): BotDocument {
    const normalized = { ...bot } as Record<string, unknown>;
    const legacyId =
      typeof normalized.mongoId === 'string' && normalized.mongoId.length > 0
        ? normalized.mongoId
        : normalized.id;

    if (normalized._id === undefined && typeof legacyId === 'string') {
      normalized._id = legacyId;
    }

    if (
      normalized.organization === undefined &&
      typeof normalized.organizationId === 'string'
    ) {
      normalized.organization = normalized.organizationId;
    }

    if (
      normalized.user === undefined &&
      typeof normalized.userId === 'string'
    ) {
      normalized.user = normalized.userId;
    }

    if (
      normalized.brand === undefined &&
      (typeof normalized.brandId === 'string' || normalized.brandId === null)
    ) {
      normalized.brand = normalized.brandId;
    }

    mergeLegacyPayload(normalized, normalized.config);
    mergeLegacyPayload(normalized, normalized.settings);

    normalized.targets = Array.isArray(normalized.targets)
      ? normalized.targets.flatMap((target) => {
          if (!isPlainObject(target)) {
            return [];
          }

          if (
            typeof target.platform !== 'string' ||
            typeof target.channelId !== 'string'
          ) {
            return [];
          }

          return [
            {
              channelId: target.channelId,
              channelLabel:
                typeof target.channelLabel === 'string'
                  ? target.channelLabel
                  : undefined,
              channelUrl:
                typeof target.channelUrl === 'string'
                  ? target.channelUrl
                  : undefined,
              credentialId:
                typeof target.credentialId === 'string'
                  ? target.credentialId
                  : undefined,
              isEnabled:
                typeof target.isEnabled === 'boolean'
                  ? target.isEnabled
                  : undefined,
              liveChatId:
                typeof target.liveChatId === 'string'
                  ? target.liveChatId
                  : undefined,
              platform: target.platform,
              senderId:
                typeof target.senderId === 'string'
                  ? target.senderId
                  : undefined,
            } satisfies BotTarget,
          ];
        })
      : [];

    if (isPlainObject(normalized.livestreamSettings)) {
      const livestreamSettings = {
        ...normalized.livestreamSettings,
      } as Record<string, unknown>;

      livestreamSettings.links = Array.isArray(livestreamSettings.links)
        ? livestreamSettings.links.flatMap((link) => {
            if (
              !isPlainObject(link) ||
              typeof link.id !== 'string' ||
              typeof link.label !== 'string' ||
              typeof link.url !== 'string'
            ) {
              return [];
            }

            return [
              {
                ...link,
                id: link.id,
                label: link.label,
                url: link.url,
              },
            ];
          })
        : [];

      livestreamSettings.messageTemplates = Array.isArray(
        livestreamSettings.messageTemplates,
      )
        ? livestreamSettings.messageTemplates.flatMap((template) => {
            if (
              !isPlainObject(template) ||
              typeof template.id !== 'string' ||
              typeof template.text !== 'string' ||
              typeof template.type !== 'string' ||
              !isLivestreamMessageType(template.type)
            ) {
              return [];
            }

            return [
              {
                ...template,
                enabled:
                  typeof template.enabled === 'boolean'
                    ? template.enabled
                    : undefined,
                id: template.id,
                platforms: Array.isArray(template.platforms)
                  ? template.platforms.filter(
                      (platform): platform is string =>
                        typeof platform === 'string',
                    )
                  : undefined,
                text: template.text,
                type: template.type,
              } satisfies BotLivestreamMessageTemplate,
            ];
          })
        : [];

      normalized.livestreamSettings = livestreamSettings;
    }

    return normalized as BotDocument;
  }

  private normalizeSessionContext(context: unknown): LivestreamSessionContext {
    const normalized = isPlainObject(context)
      ? { ...context }
      : ({} as Record<string, unknown>);
    const manualOverride = isPlainObject(normalized.manualOverride)
      ? { ...normalized.manualOverride }
      : undefined;

    if (manualOverride) {
      const expiresAt = toDate(manualOverride.expiresAt);

      if (expiresAt) {
        manualOverride.expiresAt = expiresAt;
      } else {
        delete manualOverride.expiresAt;
      }
    }

    return {
      ...normalized,
      manualOverride,
      source:
        normalized.source === 'manual_override' ||
        normalized.source === 'transcript' ||
        normalized.source === 'none'
          ? normalized.source
          : 'none',
    };
  }

  private normalizeSessionDocument(
    session: Record<string, unknown>,
  ): LivestreamBotSessionDocument {
    const normalized = { ...session };
    const legacyId =
      typeof normalized.mongoId === 'string' && normalized.mongoId.length > 0
        ? normalized.mongoId
        : normalized.id;

    if (normalized._id === undefined && typeof legacyId === 'string') {
      normalized._id = legacyId;
    }

    mergeLegacyPayload(normalized, normalized.data);

    if (normalized.bot === undefined && typeof normalized.botId === 'string') {
      normalized.bot = normalized.botId;
    }

    if (
      normalized.organization === undefined &&
      typeof normalized.organizationId === 'string'
    ) {
      normalized.organization = normalized.organizationId;
    }

    if (
      normalized.user === undefined &&
      typeof normalized.userId === 'string'
    ) {
      normalized.user = normalized.userId;
    }

    if (
      normalized.brand === undefined &&
      (typeof normalized.brandId === 'string' || normalized.brandId === null)
    ) {
      normalized.brand = normalized.brandId;
    }

    normalized.context = this.normalizeSessionContext(normalized.context);
    normalized.platformStates = Array.isArray(normalized.platformStates)
      ? normalized.platformStates.flatMap((platformState) => {
          if (
            !isPlainObject(platformState) ||
            typeof platformState.platform !== 'string'
          ) {
            return [];
          }

          return [
            {
              ...platformState,
              hourlyPostCount:
                typeof platformState.hourlyPostCount === 'number'
                  ? platformState.hourlyPostCount
                  : 0,
              hourWindowStartedAt: toDate(platformState.hourWindowStartedAt),
              lastError:
                typeof platformState.lastError === 'string'
                  ? platformState.lastError
                  : undefined,
              lastPostedAt: toDate(platformState.lastPostedAt),
              platform: platformState.platform,
            } satisfies LivestreamPlatformState,
          ];
        })
      : [];
    normalized.deliveryHistory = Array.isArray(normalized.deliveryHistory)
      ? normalized.deliveryHistory.flatMap((record) => {
          if (
            !isPlainObject(record) ||
            typeof record.id !== 'string' ||
            typeof record.message !== 'string' ||
            typeof record.platform !== 'string' ||
            typeof record.status !== 'string' ||
            typeof record.type !== 'string'
          ) {
            return [];
          }

          return [
            {
              ...record,
              createdAt: toDate(record.createdAt),
              id: record.id,
              message: record.message,
              platform: record.platform,
              reason:
                typeof record.reason === 'string' ? record.reason : undefined,
              status: record.status === 'failed' ? 'failed' : 'sent',
              targetId:
                typeof record.targetId === 'string'
                  ? record.targetId
                  : undefined,
              type: record.type as LivestreamMessageType,
            } satisfies LivestreamDeliveryRecord,
          ];
        })
      : [];
    normalized.transcriptChunks = Array.isArray(normalized.transcriptChunks)
      ? normalized.transcriptChunks.flatMap((chunk) => {
          if (!isPlainObject(chunk) || typeof chunk.text !== 'string') {
            return [];
          }

          return [
            {
              ...chunk,
              confidence:
                typeof chunk.confidence === 'number'
                  ? chunk.confidence
                  : undefined,
              createdAt: toDate(chunk.createdAt),
              text: chunk.text,
            } satisfies LivestreamTranscriptChunk,
          ];
        })
      : [];
    normalized.lastTranscriptAt = toDate(normalized.lastTranscriptAt) ?? null;
    normalized.pausedAt = toDate(normalized.pausedAt) ?? null;
    normalized.startedAt = toDate(normalized.startedAt) ?? null;
    normalized.status =
      typeof normalized.status === 'string' ? normalized.status : 'stopped';
    normalized.stoppedAt = toDate(normalized.stoppedAt) ?? null;

    return normalized as LivestreamBotSessionDocument;
  }

  private serializeSessionData(
    session: LivestreamBotSessionDocument,
  ): Prisma.InputJsonValue {
    return toJsonCompatible({
      botId: session.botId ?? session.bot ?? session.id,
      brandId: session.brandId ?? session.brand ?? null,
      context: session.context ?? { source: 'none' },
      deliveryHistory: session.deliveryHistory ?? [],
      lastTranscriptAt: session.lastTranscriptAt ?? null,
      organizationId: session.organizationId ?? session.organization,
      pausedAt: session.pausedAt ?? null,
      platformStates: session.platformStates ?? [],
      startedAt: session.startedAt ?? null,
      status: session.status ?? 'stopped',
      stoppedAt: session.stoppedAt ?? null,
      transcriptChunks: session.transcriptChunks ?? [],
      userId: session.userId ?? session.user,
    }) as Prisma.InputJsonValue;
  }

  private async findExistingSession(
    botId: string,
    organizationId: string,
  ): Promise<LivestreamBotSessionDocument | null> {
    const sessions = await this.prisma.livestreamBotSession.findMany({
      where: { isDeleted: false },
    });

    return (
      sessions
        .map((session) =>
          this.normalizeSessionDocument(session as Record<string, unknown>),
        )
        .find(
          (session) =>
            session.botId === botId &&
            session.organizationId === organizationId,
        ) ?? null
    );
  }

  private async persistSession(
    session: LivestreamBotSessionDocument,
  ): Promise<LivestreamBotSessionDocument> {
    const updated = await this.prisma.livestreamBotSession.update({
      where: { id: session.id },
      data: {
        data: this.serializeSessionData(session),
      },
    });

    const normalized = this.normalizeSessionDocument(
      updated as Record<string, unknown>,
    );
    Object.assign(session, normalized);
    return session;
  }

  async getOrCreateSession(
    bot: BotDocument,
  ): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = this.normalizeBotDocument(bot);
    const botId = String(normalizedBot.id ?? normalizedBot._id);
    const organizationId = String(
      normalizedBot.organizationId ?? normalizedBot.organization,
    );
    const existingSession = await this.findExistingSession(
      botId,
      organizationId,
    );

    if (existingSession) {
      let hasUpdates = false;
      const nextPlatformStates = this.buildPlatformStates(normalizedBot);

      if (
        (!existingSession.platformStates ||
          existingSession.platformStates.length === 0) &&
        nextPlatformStates.length > 0
      ) {
        existingSession.platformStates = nextPlatformStates;
        hasUpdates = true;
      }

      if (!existingSession.context) {
        existingSession.context = { source: 'none' };
        hasUpdates = true;
      }

      if (hasUpdates) {
        await this.persistSession(existingSession);
      }

      return existingSession;
    }

    const brandId = String(normalizedBot.brandId ?? normalizedBot.brand ?? '');
    const userId = String(normalizedBot.userId ?? normalizedBot.user);

    const created = await this.prisma.livestreamBotSession.create({
      data: {
        data: this.serializeSessionData({
          _id: '',
          bot: botId,
          botId,
          brand: brandId || null,
          brandId: brandId || null,
          context: { source: 'none' },
          createdAt: new Date(),
          deliveryHistory: [],
          id: '',
          isDeleted: false,
          mongoId: null,
          organization: organizationId,
          organizationId,
          platformStates: this.buildPlatformStates(normalizedBot),
          status: 'stopped',
          transcriptChunks: [],
          updatedAt: new Date(),
          user: userId,
          userId,
        }),
        isDeleted: false,
      },
    });

    return this.normalizeSessionDocument(created as Record<string, unknown>);
  }

  async startSession(bot: BotDocument): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = this.normalizeBotDocument(bot);
    const session = await this.getOrCreateSession(normalizedBot);
    session.status = 'active';
    session.startedAt = new Date();
    session.pausedAt = null;
    session.stoppedAt = null;
    return this.persistSession(session);
  }

  async stopSession(bot: BotDocument): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = this.normalizeBotDocument(bot);
    const session = await this.getOrCreateSession(normalizedBot);
    session.status = 'stopped';
    session.stoppedAt = new Date();
    return this.persistSession(session);
  }

  async pauseSession(bot: BotDocument): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = this.normalizeBotDocument(bot);
    const session = await this.getOrCreateSession(normalizedBot);
    session.status = 'paused';
    session.pausedAt = new Date();
    return this.persistSession(session);
  }

  async resumeSession(bot: BotDocument): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = this.normalizeBotDocument(bot);
    const session = await this.getOrCreateSession(normalizedBot);
    session.status = 'active';
    session.pausedAt = null;
    return this.persistSession(session);
  }

  async listDeliveryHistory(
    bot: BotDocument,
  ): Promise<LivestreamDeliveryRecord[]> {
    const session = await this.getOrCreateSession(
      this.normalizeBotDocument(bot),
    );
    return [...(session.deliveryHistory ?? [])].sort(
      (left, right) =>
        new Date(right.createdAt ?? 0).getTime() -
        new Date(left.createdAt ?? 0).getTime(),
    );
  }

  async setManualOverride(
    bot: BotDocument,
    payload: ManualOverridePayload,
  ): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = this.normalizeBotDocument(bot);
    const session = await this.getOrCreateSession(normalizedBot);
    const ttlMinutes =
      normalizedBot.livestreamSettings?.manualOverrideTtlMinutes ?? 15;
    const now = new Date();

    session.context = mergeSessionContext(session.context, {
      manualOverride: {
        activeLinkId: payload.activeLinkId,
        expiresAt: new Date(now.getTime() + ttlMinutes * 60 * 1000),
        promotionAngle: payload.promotionAngle,
        topic: payload.topic,
      },
    });

    await this.refreshResolvedContext(normalizedBot, session, now);
    return this.persistSession(session);
  }

  async ingestTranscriptChunk(
    bot: BotDocument,
    payload: TranscriptPayload,
  ): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = this.normalizeBotDocument(bot);
    const session = await this.getOrCreateSession(normalizedBot);
    const now = new Date();
    const transcript = await this.resolveTranscriptPayload(payload);

    const nextChunk: LivestreamTranscriptChunk = {
      confidence: transcript.confidence,
      createdAt: now,
      text: transcript.text,
    };

    const transcriptChunks = [
      ...(session.transcriptChunks ?? []),
      nextChunk,
    ].slice(-20);
    session.transcriptChunks = transcriptChunks;
    session.lastTranscriptAt = now;

    const summary = this.summarizeTranscript(
      normalizedBot,
      transcriptChunks,
      now,
    );
    session.context = mergeSessionContext(session.context, {
      currentTopic: summary.currentTopic,
      promotionAngle: session.context?.promotionAngle,
      transcriptConfidence: summary.transcriptConfidence,
      transcriptSummary: summary.transcriptSummary,
    });

    await this.refreshResolvedContext(normalizedBot, session, now);
    return this.persistSession(session);
  }

  async sendNow(
    bot: BotDocument,
    payload: SendNowPayload,
  ): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = this.normalizeBotDocument(bot);
    const session = await this.getOrCreateSession(normalizedBot);
    const target = this.findEnabledTarget(normalizedBot, payload.platform);

    if (!target) {
      throw new Error(`No enabled ${payload.platform} target configured`);
    }

    const message =
      payload.message ||
      this.buildAutomaticMessage(
        normalizedBot,
        session,
        payload.platform,
        payload.type,
      );

    if (!message) {
      throw new Error('Unable to generate a livestream message');
    }

    await this.dispatchMessage(
      normalizedBot,
      session,
      target,
      payload.platform,
      message,
      payload.type ?? this.inferMessageType(message),
    );
    return session;
  }

  @Cron('0 * * * * *')
  async processActiveSessions(): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) {
      return;
    }

    const sessions = (
      await this.prisma.livestreamBotSession.findMany({
        where: { isDeleted: false },
      })
    )
      .map((session) =>
        this.normalizeSessionDocument(session as Record<string, unknown>),
      )
      .filter((session) => session.status === 'active');

    for (const session of sessions) {
      try {
        const bot = await this.prisma.bot.findFirst({
          where: {
            id: session.botId,
            isDeleted: false,
            organizationId: session.organizationId,
          },
        });

        if (!bot) {
          continue;
        }

        await this.processSession(
          this.normalizeBotDocument(bot as unknown as BotDocument),
          session,
        );
      } catch (error) {
        this.loggerService.error('Failed to process livestream session', error);
      }
    }
  }

  private async processSession(
    bot: BotDocument,
    session: LivestreamBotSessionDocument,
  ): Promise<void> {
    const now = new Date();
    const cadenceMinutes =
      bot.livestreamSettings?.scheduledCadenceMinutes ?? 10;

    for (const target of bot.targets ?? []) {
      const platform = target.platform;

      if (!target.isEnabled || !isLivestreamPlatform(platform)) {
        continue;
      }

      const platformState = this.getPlatformState(session, platform);
      const eligibility = this.runtimeService.getDeliveryEligibility(
        {
          hourlyPostCount: platformState?.hourlyPostCount ?? 0,
          hourWindowStartedAt: platformState?.hourWindowStartedAt,
          lastPostedAt: platformState?.lastPostedAt,
          platform,
        },
        {
          maxAutoPostsPerHour: bot.livestreamSettings?.maxAutoPostsPerHour ?? 6,
          minimumMessageGapSeconds:
            bot.livestreamSettings?.minimumMessageGapSeconds ?? 90,
        },
        now,
      );

      if (!eligibility.allowed) {
        continue;
      }

      if (
        platformState?.lastPostedAt &&
        now.getTime() - platformState.lastPostedAt.getTime() <
          cadenceMinutes * 60 * 1000
      ) {
        continue;
      }

      const message = this.buildAutomaticMessage(bot, session, platform);

      if (!message) {
        continue;
      }

      const type = this.inferMessageType(message);
      await this.dispatchMessage(bot, session, target, platform, message, type);
    }
  }

  private async dispatchMessage(
    bot: BotDocument,
    session: LivestreamBotSessionDocument,
    target: BotTarget,
    platform: LivestreamPlatform,
    message: string,
    type: LivestreamMessageType,
  ): Promise<void> {
    const now = new Date();

    try {
      const delivery = await this.deliveryService.deliverMessage(
        bot,
        target,
        message,
      );
      const platformState = this.ensurePlatformState(session, platform);
      this.bumpPlatformState(platformState, now);
      platformState.lastError = undefined;

      this.appendDeliveryHistory(session, {
        createdAt: now,
        id: randomUUID(),
        message,
        platform: platform as BotPlatform,
        status: 'sent',
        targetId: delivery.resolvedTargetId,
        type,
      });

      await this.persistSession(session);
    } catch (error) {
      const platformState = this.ensurePlatformState(session, platform);
      platformState.lastError = (error as Error).message;

      this.appendDeliveryHistory(session, {
        createdAt: now,
        id: randomUUID(),
        message,
        platform: platform as BotPlatform,
        reason: (error as Error).message,
        status: 'failed',
        targetId: target.channelId,
        type,
      });

      await this.persistSession(session);
      throw error;
    }
  }

  private buildAutomaticMessage(
    bot: BotDocument,
    session: LivestreamBotSessionDocument,
    platform: LivestreamPlatform,
    preferredType?: LivestreamMessageType,
  ): string | null {
    const context = this.getResolvedContext(session);
    const templates = this.normalizeTemplates(
      bot.livestreamSettings?.messageTemplates ?? [],
      platform,
    );

    if (preferredType === 'context_aware_question') {
      return this.runtimeService.buildContextAwareQuestion(context, templates);
    }

    if (preferredType === 'scheduled_link_drop') {
      return this.buildScheduledLinkMessage(bot, templates);
    }

    if (preferredType === 'scheduled_host_prompt') {
      return this.buildScheduledHostPrompt(templates);
    }

    return (
      this.runtimeService.buildContextAwareQuestion(context, templates) ??
      this.buildScheduledLinkMessage(bot, templates) ??
      this.buildScheduledHostPrompt(templates)
    );
  }

  private buildScheduledLinkMessage(
    bot: BotDocument,
    templates: LivestreamMessageTemplate[],
  ): string | null {
    const link = bot.livestreamSettings?.links?.[0];

    if (!link) {
      return null;
    }

    const template = templates.find(
      (candidate) => candidate.type === 'scheduled_link_drop',
    );

    if (!template?.text) {
      return `${link.label}: ${link.url}`;
    }

    return template.text
      .replaceAll('{{link_label}}', link.label)
      .replaceAll('{{link_url}}', link.url);
  }

  private buildScheduledHostPrompt(
    templates: LivestreamMessageTemplate[],
  ): string | null {
    const template = templates.find(
      (candidate) => candidate.type === 'scheduled_host_prompt',
    );

    return template?.text ?? null;
  }

  private inferMessageType(message: string): LivestreamMessageType {
    if (message.includes('http://') || message.includes('https://')) {
      return 'scheduled_link_drop';
    }

    if (message.includes('?')) {
      return 'context_aware_question';
    }

    return 'scheduled_host_prompt';
  }

  private buildPlatformStates(bot: BotDocument): LivestreamPlatformState[] {
    return (bot.targets ?? []).flatMap((target) => {
      if (!isLivestreamPlatform(target.platform)) {
        return [];
      }

      return [
        {
          hourlyPostCount: 0,
          platform: target.platform,
        },
      ];
    });
  }

  private findEnabledTarget(
    bot: BotDocument,
    platform: LivestreamPlatform,
  ): BotTarget | undefined {
    return (bot.targets ?? []).find(
      (target) => target.isEnabled === true && target.platform === platform,
    );
  }

  private ensurePlatformState(
    session: LivestreamBotSessionDocument,
    platform: LivestreamPlatform,
  ): LivestreamPlatformState {
    session.platformStates ??= [];
    const existing = session.platformStates.find(
      (platformState) => platformState.platform === platform,
    );

    if (existing) {
      return existing;
    }

    const nextState: LivestreamPlatformState = {
      hourlyPostCount: 0,
      platform: platform as BotPlatform,
    };
    session.platformStates.push(nextState);
    return nextState;
  }

  private getPlatformState(
    session: LivestreamBotSessionDocument,
    platform: LivestreamPlatform,
  ): LivestreamPlatformState | undefined {
    return session.platformStates?.find(
      (platformState) => platformState.platform === platform,
    );
  }

  private bumpPlatformState(
    platformState: LivestreamPlatformState,
    now: Date,
  ): void {
    const hourWindowStartedAt = platformState.hourWindowStartedAt;

    if (
      !hourWindowStartedAt ||
      now.getTime() - hourWindowStartedAt.getTime() >= 60 * 60 * 1000
    ) {
      platformState.hourWindowStartedAt = now;
      platformState.hourlyPostCount = 1;
    } else {
      platformState.hourlyPostCount = (platformState.hourlyPostCount ?? 0) + 1;
    }

    platformState.lastPostedAt = now;
  }

  private appendDeliveryHistory(
    session: LivestreamBotSessionDocument,
    record: LivestreamDeliveryRecord,
  ): void {
    session.deliveryHistory = [
      ...(session.deliveryHistory ?? []),
      record,
    ].slice(-50);
  }

  private async resolveTranscriptPayload(
    payload: TranscriptPayload,
  ): Promise<{ confidence?: number; text: string }> {
    if (payload.text?.trim()) {
      return {
        confidence: payload.confidence,
        text: payload.text.trim(),
      };
    }

    if (!payload.audioUrl) {
      throw new Error('Transcript ingestion requires text or audioUrl');
    }

    const transcription = await this.replicateService.transcribeAudio({
      audio: {
        type: 'url',
        url: payload.audioUrl,
      },
      language: payload.language,
      prompt: payload.prompt,
    });

    return {
      confidence: transcription.confidence,
      text: transcription.text,
    };
  }

  private summarizeTranscript(
    bot: BotDocument,
    transcriptChunks: LivestreamTranscriptChunk[],
    now: Date,
  ): {
    currentTopic?: string;
    transcriptConfidence?: number;
    transcriptSummary?: string;
  } {
    const lookbackMinutes =
      bot.livestreamSettings?.transcriptLookbackMinutes ?? 3;
    const threshold = now.getTime() - lookbackMinutes * 60 * 1000;

    const relevantChunks = transcriptChunks.filter(
      (chunk) => new Date(chunk.createdAt ?? 0).getTime() >= threshold,
    );

    if (relevantChunks.length === 0) {
      return {};
    }

    const transcriptSummary = relevantChunks
      .map((chunk) => chunk.text.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);

    const currentTopic = transcriptSummary
      .split(/[.!?]/)[0]
      ?.trim()
      .slice(0, 140);
    const transcriptConfidence =
      relevantChunks.reduce(
        (total, chunk) => total + (chunk.confidence ?? 0),
        0,
      ) / relevantChunks.length;

    return {
      currentTopic,
      transcriptConfidence,
      transcriptSummary,
    };
  }

  private async refreshResolvedContext(
    bot: BotDocument,
    session: LivestreamBotSessionDocument,
    now: Date,
  ): Promise<void> {
    const resolvedContext = this.runtimeService.resolveContextState(
      {
        currentTopic: session.context?.currentTopic,
        manualOverride: session.context?.manualOverride,
        transcriptConfidence: session.context?.transcriptConfidence,
        transcriptSummary: session.context?.transcriptSummary,
      },
      now,
    );

    session.context = mergeSessionContext(session.context, {
      currentTopic:
        resolvedContext.currentTopic || session.context?.currentTopic,
      promotionAngle:
        resolvedContext.promotionAngle || session.context?.promotionAngle,
      source: resolvedContext.source,
      transcriptConfidence:
        resolvedContext.transcriptConfidence ??
        session.context?.transcriptConfidence,
      transcriptSummary:
        resolvedContext.transcriptSummary || session.context?.transcriptSummary,
    });

    if (
      bot.livestreamSettings?.transcriptEnabled === false &&
      resolvedContext.source === 'transcript'
    ) {
      session.context.source = 'none';
    }
  }

  private getResolvedContext(
    session: LivestreamBotSessionDocument,
  ): ResolvedLivestreamContext {
    return {
      currentTopic: session.context?.currentTopic,
      promotionAngle:
        session.context?.manualOverride?.promotionAngle ||
        session.context?.promotionAngle,
      source: session.context?.source ?? 'none',
      transcriptConfidence: session.context?.transcriptConfidence,
      transcriptSummary: session.context?.transcriptSummary,
    };
  }

  private normalizeTemplates(
    templates: BotLivestreamMessageTemplate[],
    platform: LivestreamPlatform,
  ): LivestreamMessageTemplate[] {
    return templates
      .filter((template): template is BotLivestreamMessageTemplate => {
        if (!template.text || !template.id || !template.type) {
          return false;
        }

        if (!template.platforms?.length) {
          return true;
        }

        return template.platforms.some((candidate) => candidate === platform);
      })
      .map((template) => ({
        enabled: template.enabled ?? true,
        id: template.id,
        platforms: template.platforms?.filter(isLivestreamPlatform) as
          | LivestreamPlatform[]
          | undefined,
        text: template.text,
        type: template.type,
      }));
  }
}

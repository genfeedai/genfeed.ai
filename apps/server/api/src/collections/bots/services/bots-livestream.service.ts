import { randomUUID } from 'node:crypto';

import type {
  BotDocument,
  BotLivestreamMessageTemplate,
  BotTarget,
} from '@api/collections/bots/schemas/bot.schema';
import type {
  LivestreamBotSessionDocument,
  LivestreamDeliveryRecord,
  LivestreamPlatformState,
  LivestreamTranscriptChunk,
} from '@api/collections/bots/schemas/livestream-bot-session.schema';
import { ConfigService } from '@api/config/config.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BotPlatform } from '@genfeedai/enums';
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

type LivestreamMessageType =
  | 'scheduled_link_drop'
  | 'scheduled_host_prompt'
  | 'context_aware_question';

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

  async getOrCreateSession(
    bot: BotDocument,
  ): Promise<LivestreamBotSessionDocument> {
    const botId = String(bot.id ?? (bot as Record<string, unknown>)._id);
    const organizationId = String(
      (bot as Record<string, unknown>).organizationId ??
        (bot as Record<string, unknown>).organization,
    );

    const existingSession = await this.prisma.livestreamBotSession.findFirst({
      where: {
        botId,
        isDeleted: false,
        organizationId,
      },
    });

    if (existingSession) {
      const session =
        existingSession as unknown as LivestreamBotSessionDocument;
      let hasUpdates = false;
      const nextPlatformStates = this.buildPlatformStates(bot);

      if (
        (!session.platformStates || session.platformStates.length === 0) &&
        nextPlatformStates.length > 0
      ) {
        session.platformStates = nextPlatformStates;
        hasUpdates = true;
      }

      if (!session.context) {
        session.context = { source: 'none' };
        hasUpdates = true;
      }

      if (hasUpdates) {
        await this.prisma.livestreamBotSession.update({
          where: { id: existingSession.id },
          data: {
            platformStates: session.platformStates as unknown as Record<
              string,
              unknown
            >[],
            context: session.context as unknown as Record<string, unknown>,
          },
        });
      }

      return session;
    }

    const brandId = String(
      (bot as Record<string, unknown>).brandId ??
        (bot as Record<string, unknown>).brand,
    );
    const userId = String(
      (bot as Record<string, unknown>).userId ??
        (bot as Record<string, unknown>).user,
    );

    const created = await this.prisma.livestreamBotSession.create({
      data: {
        botId,
        brandId,
        context: { source: 'none' } as unknown as Record<string, unknown>,
        deliveryHistory: [],
        isDeleted: false,
        organizationId,
        platformStates: this.buildPlatformStates(bot) as unknown as Record<
          string,
          unknown
        >[],
        status: 'stopped',
        transcriptChunks: [],
        userId,
      },
    });

    return created as unknown as LivestreamBotSessionDocument;
  }

  async startSession(bot: BotDocument): Promise<LivestreamBotSessionDocument> {
    const session = await this.getOrCreateSession(bot);
    const updated = await this.prisma.livestreamBotSession.update({
      where: { id: (session as Record<string, unknown>).id as string },
      data: {
        status: 'active',
        startedAt: new Date(),
        pausedAt: null,
        stoppedAt: null,
      },
    });
    return updated as unknown as LivestreamBotSessionDocument;
  }

  async stopSession(bot: BotDocument): Promise<LivestreamBotSessionDocument> {
    const session = await this.getOrCreateSession(bot);
    const updated = await this.prisma.livestreamBotSession.update({
      where: { id: (session as Record<string, unknown>).id as string },
      data: { status: 'stopped', stoppedAt: new Date() },
    });
    return updated as unknown as LivestreamBotSessionDocument;
  }

  async pauseSession(bot: BotDocument): Promise<LivestreamBotSessionDocument> {
    const session = await this.getOrCreateSession(bot);
    const updated = await this.prisma.livestreamBotSession.update({
      where: { id: (session as Record<string, unknown>).id as string },
      data: { status: 'paused', pausedAt: new Date() },
    });
    return updated as unknown as LivestreamBotSessionDocument;
  }

  async resumeSession(bot: BotDocument): Promise<LivestreamBotSessionDocument> {
    const session = await this.getOrCreateSession(bot);
    const updated = await this.prisma.livestreamBotSession.update({
      where: { id: (session as Record<string, unknown>).id as string },
      data: { status: 'active', pausedAt: null },
    });
    return updated as unknown as LivestreamBotSessionDocument;
  }

  async listDeliveryHistory(
    bot: BotDocument,
  ): Promise<LivestreamDeliveryRecord[]> {
    const session = await this.getOrCreateSession(bot);
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
    const session = await this.getOrCreateSession(bot);
    const ttlMinutes = bot.livestreamSettings?.manualOverrideTtlMinutes ?? 15;
    const now = new Date();

    session.context = {
      ...session.context,
      manualOverride: {
        activeLinkId: payload.activeLinkId,
        expiresAt: new Date(now.getTime() + ttlMinutes * 60 * 1000),
        promotionAngle: payload.promotionAngle,
        topic: payload.topic,
      },
    };

    await this.refreshResolvedContext(bot, session, now);

    const updated = await this.prisma.livestreamBotSession.update({
      where: { id: (session as Record<string, unknown>).id as string },
      data: {
        context: session.context as unknown as Record<string, unknown>,
      },
    });
    return updated as unknown as LivestreamBotSessionDocument;
  }

  async ingestTranscriptChunk(
    bot: BotDocument,
    payload: TranscriptPayload,
  ): Promise<LivestreamBotSessionDocument> {
    const session = await this.getOrCreateSession(bot);
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

    const summary = this.summarizeTranscript(bot, transcriptChunks, now);
    session.context = {
      ...session.context,
      currentTopic: summary.currentTopic,
      promotionAngle: session.context?.promotionAngle,
      transcriptConfidence: summary.transcriptConfidence,
      transcriptSummary: summary.transcriptSummary,
    };

    await this.refreshResolvedContext(bot, session, now);

    const updated = await this.prisma.livestreamBotSession.update({
      where: { id: (session as Record<string, unknown>).id as string },
      data: {
        transcriptChunks: transcriptChunks as unknown as Record<
          string,
          unknown
        >[],
        lastTranscriptAt: now,
        context: session.context as unknown as Record<string, unknown>,
      },
    });
    return updated as unknown as LivestreamBotSessionDocument;
  }

  async sendNow(
    bot: BotDocument,
    payload: SendNowPayload,
  ): Promise<LivestreamBotSessionDocument> {
    const session = await this.getOrCreateSession(bot);
    const target = this.findEnabledTarget(bot, payload.platform);

    if (!target) {
      throw new Error(`No enabled ${payload.platform} target configured`);
    }

    const message =
      payload.message ||
      this.buildAutomaticMessage(bot, session, payload.platform, payload.type);

    if (!message) {
      throw new Error('Unable to generate a livestream message');
    }

    await this.dispatchMessage(
      bot,
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

    const sessions = await this.prisma.livestreamBotSession.findMany({
      where: { isDeleted: false, status: 'active' },
    });

    for (const session of sessions) {
      try {
        const sessionDoc =
          session as unknown as LivestreamBotSessionDocument & {
            botId: string;
            organizationId: string;
          };

        const bot = await this.prisma.bot.findFirst({
          where: {
            id: sessionDoc.botId,
            isDeleted: false,
            organizationId: sessionDoc.organizationId,
          },
        });

        if (!bot) {
          continue;
        }

        await this.processSession(bot as unknown as BotDocument, sessionDoc);
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
    const sessionId = (session as Record<string, unknown>).id as string;
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

      await this.prisma.livestreamBotSession.update({
        where: { id: sessionId },
        data: {
          platformStates: session.platformStates as unknown as Record<
            string,
            unknown
          >[],
          deliveryHistory: session.deliveryHistory as unknown as Record<
            string,
            unknown
          >[],
        },
      });
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

      await this.prisma.livestreamBotSession.update({
        where: { id: sessionId },
        data: {
          platformStates: session.platformStates as unknown as Record<
            string,
            unknown
          >[],
          deliveryHistory: session.deliveryHistory as unknown as Record<
            string,
            unknown
          >[],
        },
      });
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

    session.context = {
      ...session.context,
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
    };

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

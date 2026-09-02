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
  LivestreamTranscriptChunk,
} from '@api/collections/bots/schemas/livestream-bot-session.schema';
import { scopedWhere } from '@api/index';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { requireRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import { BotPlatform, LivestreamTranscriptSource } from '@genfeedai/contracts';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common';
import {
  mergeLivestreamSessionContext,
  normalizeLivestreamBotDocument,
  normalizeLivestreamSessionDocument,
  serializeLivestreamSessionData,
} from './bots-livestream-data.util';
import { BotsLivestreamDeliveryService } from './bots-livestream-delivery.service';
import {
  BotsLivestreamRuntimeService,
  type LivestreamMessageTemplate,
  type LivestreamPlatform,
  type ResolvedLivestreamContext,
} from './bots-livestream-runtime.service';
import { BotsRestreamChatService } from './bots-restream-chat.service';

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

@Injectable()
export class BotsLivestreamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryService: BotsLivestreamDeliveryService,
    private readonly loggerService: LoggerService,
    private readonly replicateService: ReplicateService,
    private readonly runtimeService: BotsLivestreamRuntimeService,
    @Optional()
    @Inject(forwardRef(() => BotsRestreamChatService))
    private readonly restreamChatService?: BotsRestreamChatService,
  ) {}

  private async findExistingSession(
    botId: string,
    organizationId: string,
  ): Promise<LivestreamBotSessionDocument | null> {
    const session = await this.prisma.livestreamBotSession.findFirst({
      where: { botId, isDeleted: false, organizationId },
    });

    return session
      ? normalizeLivestreamSessionDocument(session as Record<string, unknown>)
      : null;
  }

  private async persistSession(
    session: LivestreamBotSessionDocument,
  ): Promise<LivestreamBotSessionDocument> {
    if (!session.organizationId) {
      throw new Error(
        'Cannot persist a livestream session without an organization',
      );
    }

    const updated = await this.prisma.livestreamBotSession.update({
      where: scopedWhere(session.organizationId, { id: session.id }),
      data: {
        data: serializeLivestreamSessionData(session),
      },
    });

    const normalized = normalizeLivestreamSessionDocument(
      updated as Record<string, unknown>,
    );
    Object.assign(session, normalized);
    return session;
  }

  async getOrCreateSession(
    bot: BotDocument,
  ): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = normalizeLivestreamBotDocument(bot);
    const botId = requireRelationId(normalizedBot.id, 'id', 'Livestream bot');
    const organizationId = requireRelationId(
      normalizedBot.organizationId,
      'organization',
      'Livestream bot',
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

    const brandId = normalizedBot.brandId ?? null;
    const userId = requireRelationId(
      normalizedBot.userId,
      'user',
      'Livestream bot',
    );

    const created = await this.prisma.livestreamBotSession.create({
      data: {
        data: toPrismaJson(
          serializeLivestreamSessionData({
            context: { source: 'none' },
            deliveryHistory: [],
            platformStates: this.buildPlatformStates(normalizedBot),
            status: 'stopped',
            transcriptChunks: [],
          }),
        ),
        botId,
        brandId,
        isDeleted: false,
        organizationId,
        userId,
      },
    });

    return normalizeLivestreamSessionDocument(
      created as Record<string, unknown>,
    );
  }

  async startSession(bot: BotDocument): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = normalizeLivestreamBotDocument(bot);
    const session = await this.getOrCreateSession(normalizedBot);
    session.status = 'active';
    session.startedAt = new Date();
    session.pausedAt = null;
    session.stoppedAt = null;
    return this.persistSession(session);
  }

  async stopSession(bot: BotDocument): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = normalizeLivestreamBotDocument(bot);
    const session = await this.getOrCreateSession(normalizedBot);
    session.status = 'stopped';
    session.stoppedAt = new Date();
    return this.persistSession(session);
  }

  async pauseSession(bot: BotDocument): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = normalizeLivestreamBotDocument(bot);
    const session = await this.getOrCreateSession(normalizedBot);
    session.status = 'paused';
    session.pausedAt = new Date();
    return this.persistSession(session);
  }

  async resumeSession(bot: BotDocument): Promise<LivestreamBotSessionDocument> {
    const normalizedBot = normalizeLivestreamBotDocument(bot);
    const session = await this.getOrCreateSession(normalizedBot);
    session.status = 'active';
    session.pausedAt = null;
    return this.persistSession(session);
  }

  async listDeliveryHistory(
    bot: BotDocument,
  ): Promise<LivestreamDeliveryRecord[]> {
    const session = await this.getOrCreateSession(
      normalizeLivestreamBotDocument(bot),
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
    const normalizedBot = normalizeLivestreamBotDocument(bot);
    const session = await this.getOrCreateSession(normalizedBot);
    const ttlMinutes =
      normalizedBot.livestreamSettings?.manualOverrideTtlMinutes ?? 15;
    const now = new Date();

    session.context = mergeLivestreamSessionContext(session.context, {
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
    const normalizedBot = normalizeLivestreamBotDocument(bot);
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
    session.context = mergeLivestreamSessionContext(session.context, {
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
    const normalizedBot = normalizeLivestreamBotDocument(bot);
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

  async discoverActiveSessionsForOrganization(
    organizationId: string,
  ): Promise<LivestreamBotSessionDocument[]> {
    return (
      await this.prisma.livestreamBotSession.findMany({
        where: scopedWhere(organizationId),
      })
    )
      .map((session) =>
        normalizeLivestreamSessionDocument(session as Record<string, unknown>),
      )
      .filter((session) => session.status === 'active');
  }

  async loadActiveSessionContext(
    organizationId: string,
    session: LivestreamBotSessionDocument,
  ): Promise<Record<string, unknown>> {
    if (!session.botId) {
      return { sessionId: session.id, status: 'skipped' };
    }
    const bot = await this.prisma.bot.findFirst({
      where: scopedWhere(organizationId, { id: session.botId }),
    });
    if (!bot) {
      return { sessionId: session.id, status: 'skipped' };
    }
    return {
      bot: normalizeLivestreamBotDocument(bot as unknown as BotDocument),
      session,
      sessionId: session.id,
      status: 'loaded',
    };
  }

  async syncActiveSessionRestream(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (input.status !== 'loaded') {
      return input;
    }
    const bot = normalizeLivestreamBotDocument(
      input.bot as unknown as BotDocument,
    );
    const transcriptSource = bot.livestreamSettings?.transcriptSource;
    if (
      this.restreamChatService &&
      (transcriptSource === LivestreamTranscriptSource.RESTREAM_CHAT ||
        transcriptSource === 'restream_chat')
    ) {
      try {
        await this.restreamChatService.syncActiveSessionChat(bot);
      } catch (error) {
        this.loggerService.warn('Restream chat sync skipped for session', {
          botId: bot.id,
          error,
          sessionId: input.sessionId,
        });
      }
    }
    return input;
  }

  discoverActiveSessionTargets(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    if (input.status !== 'loaded') {
      return { ...input, baseInput: {}, items: [] };
    }
    const bot = normalizeLivestreamBotDocument(
      input.bot as unknown as BotDocument,
    );
    const session = normalizeLivestreamSessionDocument(
      input.session as Record<string, unknown>,
    );
    const now = new Date();
    const cadenceMinutes =
      bot.livestreamSettings?.scheduledCadenceMinutes ?? 10;
    const items = (bot.targets ?? []).filter((target) => {
      const platform = target.platform;
      if (!target.isEnabled || !isLivestreamPlatform(platform)) return false;
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
      if (!eligibility.allowed) return false;
      if (
        platformState?.lastPostedAt &&
        now.getTime() - platformState.lastPostedAt.getTime() <
          cadenceMinutes * 60 * 1000
      ) {
        return false;
      }
      return this.buildAutomaticMessage(bot, session, platform) !== null;
    });
    return {
      ...input,
      baseInput: {
        bot,
        organizationId: session.organizationId,
        sessionId: session.id,
      },
      items,
    };
  }

  async deliverActiveSessionTarget(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const target = input.item as BotTarget | undefined;
    if (!target || !isLivestreamPlatform(target.platform)) {
      return { status: 'skipped' };
    }
    const sessionId = String(input.sessionId ?? '');
    const sessionRow = await this.prisma.livestreamBotSession.findFirst({
      where: scopedWhere(organizationId, { id: sessionId }),
    });
    if (!sessionRow) {
      return { status: 'skipped', targetId: target.channelId };
    }
    const bot = normalizeLivestreamBotDocument(
      input.bot as unknown as BotDocument,
    );
    const session = normalizeLivestreamSessionDocument(
      sessionRow as Record<string, unknown>,
    );
    const message = this.buildAutomaticMessage(bot, session, target.platform);
    if (!message) {
      return { status: 'skipped', targetId: target.channelId };
    }
    await this.dispatchMessage(
      bot,
      session,
      target,
      target.platform,
      message,
      this.inferMessageType(message),
    );
    return { status: 'processed', targetId: target.channelId };
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

    session.context = mergeLivestreamSessionContext(session.context, {
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

import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  BotCategory,
  BotPlatform,
  BotStatus,
  LivestreamTranscriptSource,
  Platform,
  parsePlatform,
} from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { AgentToolName } from '@genfeedai/contracts/interfaces';
import { Inject, Injectable, Optional } from '@nestjs/common';

type LivestreamBotPlatform = Platform.YOUTUBE | Platform.TWITCH;
type LivestreamBotMessageType =
  | 'scheduled_link_drop'
  | 'scheduled_host_prompt'
  | 'context_aware_question';

const LIVESTREAM_BOT_CATEGORY = 'livestream_chat';

interface AgentLivestreamBotRecord {
  id: unknown;
  brandId?: unknown;
  brand?: unknown;
  category?: string;
  label: string;
  livestreamSettings?: Record<string, unknown>;
  organization?: unknown;
  platforms?: string[];
  targets?: Array<Record<string, unknown>>;
  user?: unknown;
}

interface AgentLivestreamSessionRecord {
  context?: Record<string, unknown>;
  deliveryHistory?: Record<string, unknown>[];
  platformStates?: Record<string, unknown>[];
  status?: string;
}

interface AgentBotsServiceLike {
  create: (
    createDto: Record<string, unknown>,
  ) => Promise<AgentLivestreamBotRecord>;
  findOne: (
    query: Record<string, unknown>,
  ) => Promise<AgentLivestreamBotRecord | null>;
}

interface AgentBotsLivestreamServiceLike {
  getOrCreateSession: (
    bot: AgentLivestreamBotRecord,
  ) => Promise<AgentLivestreamSessionRecord>;
  pauseSession: (
    bot: AgentLivestreamBotRecord,
  ) => Promise<AgentLivestreamSessionRecord>;
  resumeSession: (
    bot: AgentLivestreamBotRecord,
  ) => Promise<AgentLivestreamSessionRecord>;
  sendNow: (
    bot: AgentLivestreamBotRecord,
    payload: {
      message?: string;
      platform: LivestreamBotPlatform;
      type?: LivestreamBotMessageType;
    },
  ) => Promise<AgentLivestreamSessionRecord>;
  setManualOverride: (
    bot: AgentLivestreamBotRecord,
    payload: {
      activeLinkId?: string;
      promotionAngle?: string;
      topic?: string;
    },
  ) => Promise<AgentLivestreamSessionRecord>;
  startSession: (
    bot: AgentLivestreamBotRecord,
  ) => Promise<AgentLivestreamSessionRecord>;
  stopSession: (
    bot: AgentLivestreamBotRecord,
  ) => Promise<AgentLivestreamSessionRecord>;
}

/**
 * Livestream chat bot tools (`create_livestream_bot`, `manage_livestream_bot`).
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentLivestreamToolHandler {
  constructor(
    private readonly brandsService: BrandsService,
    @Optional()
    @Inject('AGENT_BOTS_SERVICE')
    private readonly botsService: AgentBotsServiceLike | undefined,
    @Optional()
    @Inject('AGENT_BOTS_LIVESTREAM_SERVICE')
    private readonly botsLivestreamService:
      | AgentBotsLivestreamServiceLike
      | undefined,
  ) {}

  async createLivestreamBot(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.botsService || !this.botsLivestreamService) {
      return {
        creditsUsed: 0,
        error: 'Livestream bot creation is not available in this environment.',
        success: false,
      };
    }

    const platform = this.normalizeLivestreamBotPlatform(params.platform);
    const label = String(params.label || '').trim();
    const channelId = String(params.channelId || '').trim();

    if (!platform || !label || !channelId) {
      return {
        creditsUsed: 0,
        error: 'platform, label, and channelId are required.',
        success: false,
      };
    }

    const brand = await this.resolveWorkflowBrand(params, ctx);
    if (!brand) {
      return {
        creditsUsed: 0,
        error:
          'No valid brand is available. Select a brand or refresh your brand context before creating a livestream bot.',
        success: false,
      };
    }

    const botPlatform = this.toBotPlatform(platform);
    const createdBot = await this.botsService.create({
      brandId: String(brand.id),
      category: LIVESTREAM_BOT_CATEGORY,
      description:
        typeof params.description === 'string'
          ? params.description.trim()
          : undefined,
      label,
      livestreamSettings: this.buildDefaultLivestreamSettings({
        contextTemplate:
          typeof params.contextTemplate === 'string'
            ? params.contextTemplate
            : undefined,
        hostPromptTemplate:
          typeof params.hostPromptTemplate === 'string'
            ? params.hostPromptTemplate
            : undefined,
        linkLabel:
          typeof params.linkLabel === 'string' ? params.linkLabel : undefined,
        linkUrl:
          typeof params.linkUrl === 'string' ? params.linkUrl : undefined,
        maxAutoPostsPerHour:
          typeof params.maxAutoPostsPerHour === 'number'
            ? params.maxAutoPostsPerHour
            : undefined,
        minimumMessageGapSeconds:
          typeof params.minimumMessageGapSeconds === 'number'
            ? params.minimumMessageGapSeconds
            : undefined,
        platform,
        scheduledCadenceMinutes:
          typeof params.scheduledCadenceMinutes === 'number'
            ? params.scheduledCadenceMinutes
            : undefined,
        transcriptEnabled:
          typeof params.transcriptEnabled === 'boolean'
            ? params.transcriptEnabled
            : undefined,
      }),
      organizationId: ctx.organizationId,
      platforms: [botPlatform],
      settings: {
        messagesPerMinute: 5,
        responseDelaySeconds: 5,
        responses: [],
        triggers: [],
      },
      status: BotStatus.ACTIVE,
      targets: [
        {
          channelId,
          channelLabel:
            typeof params.botChannelLabel === 'string'
              ? params.botChannelLabel.trim() || undefined
              : undefined,
          channelUrl:
            typeof params.botChannelUrl === 'string'
              ? params.botChannelUrl.trim() || undefined
              : undefined,
          credentialId:
            typeof params.credentialId === 'string'
              ? params.credentialId
              : undefined,
          isEnabled: true,
          liveChatId:
            platform === Platform.YOUTUBE &&
            typeof params.liveChatId === 'string'
              ? params.liveChatId.trim() || undefined
              : undefined,
          platform: botPlatform,
          senderId:
            platform === Platform.TWITCH && typeof params.senderId === 'string'
              ? params.senderId.trim() || undefined
              : undefined,
        },
      ],
      userId: ctx.userId,
    });

    const session =
      await this.botsLivestreamService.getOrCreateSession(createdBot);

    return this.buildLivestreamBotCreatedResult({
      bot: createdBot,
      brandId: String(brand.id),
      creditsUsed: 0,
      organizationId: ctx.organizationId,
      platform,
      session,
    });
  }

  async manageLivestreamBot(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.botsLivestreamService) {
      return {
        creditsUsed: 0,
        error: 'Livestream bot controls are not available in this environment.',
        success: false,
      };
    }

    const botId = String(params.botId || '').trim();
    const action = String(params.action || '').trim();

    if (!botId || !action) {
      return {
        creditsUsed: 0,
        error: 'botId and action are required.',
        success: false,
      };
    }

    const managed = await this.findLivestreamBotForManagement(botId, ctx);
    if (!managed) {
      return {
        creditsUsed: 0,
        error:
          'Livestream bot not found for the current organization and brand.',
        success: false,
      };
    }

    const requestedPlatform = this.normalizeLivestreamBotPlatform(
      params.platform,
    );
    let nextSession: AgentLivestreamSessionRecord;

    switch (action) {
      case 'start_session':
        nextSession = await this.botsLivestreamService.startSession(
          managed.bot,
        );
        break;
      case 'pause_session':
        nextSession = await this.botsLivestreamService.pauseSession(
          managed.bot,
        );
        break;
      case 'resume_session':
        nextSession = await this.botsLivestreamService.resumeSession(
          managed.bot,
        );
        break;
      case 'stop_session':
        nextSession = await this.botsLivestreamService.stopSession(managed.bot);
        break;
      case 'set_override':
        if (
          typeof params.topic !== 'string' &&
          typeof params.promotionAngle !== 'string' &&
          typeof params.activeLinkId !== 'string'
        ) {
          return {
            creditsUsed: 0,
            error:
              'set_override requires at least one of topic, promotionAngle, or activeLinkId.',
            success: false,
          };
        }

        nextSession = await this.botsLivestreamService.setManualOverride(
          managed.bot,
          {
            activeLinkId:
              typeof params.activeLinkId === 'string'
                ? params.activeLinkId.trim() || undefined
                : undefined,
            promotionAngle:
              typeof params.promotionAngle === 'string'
                ? params.promotionAngle.trim() || undefined
                : undefined,
            topic:
              typeof params.topic === 'string'
                ? params.topic.trim() || undefined
                : undefined,
          },
        );
        break;
      case 'send_now': {
        const sendPlatform =
          requestedPlatform ?? this.inferLivestreamBotPlatform(managed.bot);

        nextSession = await this.botsLivestreamService.sendNow(managed.bot, {
          message:
            typeof params.message === 'string'
              ? params.message.trim() || undefined
              : undefined,
          platform: sendPlatform,
          type:
            params.type === 'scheduled_link_drop' ||
            params.type === 'scheduled_host_prompt' ||
            params.type === 'context_aware_question'
              ? (params.type as LivestreamBotMessageType)
              : undefined,
        });
        break;
      }
      default:
        return {
          creditsUsed: 0,
          error: `Unsupported livestream bot action: ${action}`,
          success: false,
        };
    }

    return this.buildLivestreamBotStatusResult({
      bot: managed.bot,
      creditsUsed: 0,
      platform:
        requestedPlatform ?? this.inferLivestreamBotPlatform(managed.bot),
      session: nextSession,
      statusDescription:
        action === 'set_override'
          ? 'Livestream bot override updated.'
          : action === 'send_now'
            ? 'Livestream bot sent a message immediately.'
            : `Livestream bot action completed: ${action}.`,
    });
  }

  private normalizeLivestreamBotPlatform(
    platform: unknown,
  ): LivestreamBotPlatform | null {
    const parsed = parsePlatform(platform);
    if (parsed === Platform.YOUTUBE || parsed === Platform.TWITCH) {
      return parsed;
    }
    return null;
  }

  private toBotPlatform(platform: LivestreamBotPlatform): BotPlatform {
    return platform === Platform.YOUTUBE
      ? BotPlatform.YOUTUBE
      : BotPlatform.TWITCH;
  }

  private getLivestreamBotPageHref(platform: LivestreamBotPlatform): string {
    return platform === Platform.YOUTUBE
      ? '/agents/bots/youtube-chat'
      : '/agents/bots/twitch-chat';
  }

  private buildDefaultLivestreamSettings(params: {
    contextTemplate?: string;
    hostPromptTemplate?: string;
    linkLabel?: string;
    linkUrl?: string;
    maxAutoPostsPerHour?: number;
    minimumMessageGapSeconds?: number;
    platform: LivestreamBotPlatform;
    scheduledCadenceMinutes?: number;
    transcriptEnabled?: boolean;
  }): Record<string, unknown> {
    const platform = this.toBotPlatform(params.platform);
    const linkUrl = params.linkUrl?.trim();
    const linkLabel = params.linkLabel?.trim();
    const contextTemplate =
      params.contextTemplate?.trim() ||
      'What is your take on {{topic}} right now?';
    const hostPromptTemplate =
      params.hostPromptTemplate?.trim() ||
      'Hosts, what should the audience build with this tonight?';

    return {
      automaticPosting: true,
      links: linkUrl
        ? [
            {
              id: 'primary-link',
              label: linkLabel || 'Show Notes',
              url: linkUrl,
            },
          ]
        : [],
      manualOverrideTtlMinutes: 15,
      maxAutoPostsPerHour: params.maxAutoPostsPerHour ?? 6,
      messageTemplates: [
        {
          enabled: true,
          id: 'scheduled-link',
          platforms: [platform],
          text: '{{link_label}}: {{link_url}}',
          type: 'scheduled_link_drop',
        },
        {
          enabled: true,
          id: 'scheduled-host-prompt',
          platforms: [platform],
          text: hostPromptTemplate,
          type: 'scheduled_host_prompt',
        },
        {
          enabled: true,
          id: 'context-aware-question',
          platforms: [platform],
          text: contextTemplate,
          type: 'context_aware_question',
        },
      ],
      minimumMessageGapSeconds: params.minimumMessageGapSeconds ?? 90,
      prioritizeYoutube: true,
      scheduledCadenceMinutes: params.scheduledCadenceMinutes ?? 10,
      targetAudience: ['hosts', 'audience'],
      // Restream-first: unified chat WS when brand has a RESTREAM OAuth credential.
      // restreamCredentialId is auto-bound at runtime by BotsRestreamChatService.
      transcriptEnabled: params.transcriptEnabled ?? true,
      transcriptLookbackMinutes: 3,
      transcriptSource: LivestreamTranscriptSource.RESTREAM_CHAT,
    };
  }

  private buildLivestreamBotCreatedResult(params: {
    bot: AgentLivestreamBotRecord;
    brandId: string;
    creditsUsed: number;
    organizationId: string;
    platform: LivestreamBotPlatform;
    session: AgentLivestreamSessionRecord;
  }): AgentToolResult {
    const botId = String(params.bot.id);
    const openHref = this.getLivestreamBotPageHref(params.platform);

    return {
      creditsUsed: params.creditsUsed,
      data: {
        botId,
        botName: params.bot.label,
        brandId: params.brandId,
        openUrl: openHref,
        organizationId: params.organizationId,
        platform: params.platform,
        sessionStatus: params.session.status,
      },
      nextActions: [
        {
          botId,
          botName: params.bot.label,
          brandId: params.brandId,
          ctas: [
            {
              href: openHref,
              label: 'Open bot',
            },
            {
              action: AgentToolName.MANAGE_LIVESTREAM_BOT,
              label: 'Start session',
              payload: {
                action: 'start_session',
                botId,
              },
            },
            {
              action: AgentToolName.MANAGE_LIVESTREAM_BOT,
              label: 'Send message now',
              payload: {
                action: 'send_now',
                botId,
                platform: params.platform,
              },
            },
          ],
          description: 'Livestream chat bot created and ready for control.',
          id: `bot-created-${botId}`,
          platform: params.platform,
          sessionStatus: params.session.status,
          title: 'Livestream bot created',
          type: 'bot_created_card' as const,
        },
      ],
      success: true,
    };
  }

  private buildLivestreamBotStatusResult(params: {
    bot: AgentLivestreamBotRecord;
    creditsUsed: number;
    platform: LivestreamBotPlatform;
    session: AgentLivestreamSessionRecord;
    statusDescription: string;
  }): AgentToolResult {
    const botId = String(params.bot.id);
    const openHref = this.getLivestreamBotPageHref(params.platform);
    const nextControlCta =
      params.session.status === 'active'
        ? {
            action: AgentToolName.MANAGE_LIVESTREAM_BOT,
            label: 'Pause session',
            payload: {
              action: 'pause_session',
              botId,
            },
          }
        : params.session.status === 'paused'
          ? {
              action: AgentToolName.MANAGE_LIVESTREAM_BOT,
              label: 'Resume session',
              payload: {
                action: 'resume_session',
                botId,
              },
            }
          : {
              action: AgentToolName.MANAGE_LIVESTREAM_BOT,
              label: 'Start session',
              payload: {
                action: 'start_session',
                botId,
              },
            };

    return {
      creditsUsed: params.creditsUsed,
      data: {
        botId,
        botName: params.bot.label,
        openUrl: openHref,
        platform: params.platform,
        sessionStatus: params.session.status,
      },
      nextActions: [
        {
          botId,
          botName: params.bot.label,
          ctas: [
            {
              href: openHref,
              label: 'Open bot',
            },
            nextControlCta,
            {
              action: AgentToolName.MANAGE_LIVESTREAM_BOT,
              label: 'Stop session',
              payload: {
                action: 'stop_session',
                botId,
              },
            },
            {
              action: AgentToolName.MANAGE_LIVESTREAM_BOT,
              label: 'Send message now',
              payload: {
                action: 'send_now',
                botId,
                platform: params.platform,
              },
            },
          ],
          data: {
            context: params.session.context,
            deliveryHistory: params.session.deliveryHistory ?? [],
            platformStates: params.session.platformStates ?? [],
          },
          description: params.statusDescription,
          id: `livestream-bot-status-${botId}`,
          platform: params.platform,
          sessionStatus: params.session.status,
          title: 'Livestream bot status',
          type: 'livestream_bot_status_card' as const,
        },
      ],
      success: true,
    };
  }

  private isLivestreamBot(bot: AgentLivestreamBotRecord): boolean {
    if (
      bot.category === LIVESTREAM_BOT_CATEGORY ||
      bot.category === BotCategory.LIVESTREAM_CHAT
    ) {
      return true;
    }

    return (bot.platforms ?? []).some(
      (platform) =>
        platform === BotPlatform.YOUTUBE || platform === BotPlatform.TWITCH,
    );
  }

  private inferLivestreamBotPlatform(
    bot: AgentLivestreamBotRecord,
    requestedPlatform?: LivestreamBotPlatform | null,
  ): LivestreamBotPlatform {
    if (requestedPlatform) {
      return requestedPlatform;
    }

    const target = (bot.targets ?? []).find(
      (candidate) =>
        candidate.platform === BotPlatform.YOUTUBE ||
        candidate.platform === BotPlatform.TWITCH,
    );

    if (target?.platform === BotPlatform.YOUTUBE) {
      return Platform.YOUTUBE;
    }

    return Platform.TWITCH;
  }

  private async findLivestreamBotForManagement(
    botId: string,
    ctx: ToolExecutionContext,
  ): Promise<{
    bot: AgentLivestreamBotRecord;
    platform: LivestreamBotPlatform;
    session: AgentLivestreamSessionRecord;
  } | null> {
    if (!this.botsService || !this.botsLivestreamService) {
      return null;
    }

    if (!botId) {
      return null;
    }

    const bot = await this.botsService.findOne({
      id: botId,
      organizationId: ctx.organizationId,
    });

    if (!bot || !this.isLivestreamBot(bot)) {
      return null;
    }

    const brand = await this.resolveWorkflowBrand({}, ctx);
    // Scalar FK: an undefined `bot.brand` collapsed this brand-scope gate.
    const botBrandId = bot.brandId ?? undefined;
    if (botBrandId && (!brand || botBrandId !== String(brand.id))) {
      return null;
    }

    const session = await this.botsLivestreamService.getOrCreateSession(bot);

    return {
      bot,
      platform: this.inferLivestreamBotPlatform(bot),
      session,
    };
  }

  private async resolveWorkflowBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown> | null> {
    if (typeof params.brandId === 'string') {
      const explicitBrand = await this.brandsService.findOne({
        id: params.brandId,
        organizationId: ctx.organizationId,
      });

      if (explicitBrand) {
        return explicitBrand as unknown as Record<string, unknown>;
      }
    }

    const currentBrand = await this.brandsService.findOne({
      isSelected: true,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });

    if (currentBrand) {
      return currentBrand as unknown as Record<string, unknown>;
    }

    if (ctx.brandId) {
      const contextBrand = await this.brandsService.findOne({
        id: ctx.brandId,
        organizationId: ctx.organizationId,
      });

      if (contextBrand) {
        return contextBrand as unknown as Record<string, unknown>;
      }
    }

    const firstOrgBrand = await this.brandsService.findOne({
      organizationId: ctx.organizationId,
    });

    return firstOrgBrand
      ? (firstOrgBrand as unknown as Record<string, unknown>)
      : null;
  }
}

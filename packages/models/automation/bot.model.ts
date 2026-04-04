import type { IBot, IBotSettings, IBotTarget } from '@cloud/interfaces';
import { Bot as BaseBot } from '@genfeedai/client/models';
import {
  BotLivestreamMessageType,
  BotLivestreamTargetAudience,
  BotPlatform,
} from '@genfeedai/enums';

export interface BotLivestreamLink {
  id: string;
  label: string;
  url: string;
}

export interface BotLivestreamMessageTemplate {
  enabled: boolean;
  id: string;
  platforms?: BotPlatform[];
  text: string;
  type: BotLivestreamMessageType;
}

export interface BotLivestreamSettings {
  automaticPosting: boolean;
  links: BotLivestreamLink[];
  manualOverrideTtlMinutes: number;
  maxAutoPostsPerHour: number;
  messageTemplates: BotLivestreamMessageTemplate[];
  minimumMessageGapSeconds: number;
  prioritizeYoutube: boolean;
  scheduledCadenceMinutes: number;
  targetAudience: BotLivestreamTargetAudience[];
  transcriptEnabled: boolean;
  transcriptLookbackMinutes: number;
}

export interface BotTarget extends IBotTarget {
  credentialId?: string;
  liveChatId?: string;
  senderId?: string;
}

interface LivestreamBot extends IBot {
  livestreamSettings?: BotLivestreamSettings;
  targets: BotTarget[];
}

function normalizeSettings(settings?: Partial<IBotSettings>): IBotSettings {
  return {
    messagesPerMinute: settings?.messagesPerMinute ?? 10,
    responseDelaySeconds: settings?.responseDelaySeconds ?? 5,
    responses: [...(settings?.responses ?? [])].map((template) => ({
      response: template.response ?? '',
      trigger: template.trigger ?? '',
    })),
    triggers: [...(settings?.triggers ?? [])],
  };
}

function normalizeLivestreamSettings(
  settings?: Partial<BotLivestreamSettings>,
): BotLivestreamSettings | undefined {
  if (!settings) {
    return undefined;
  }

  return {
    automaticPosting: settings.automaticPosting ?? true,
    links: [...(settings.links ?? [])].map((link) => ({
      id: link.id,
      label: link.label,
      url: link.url,
    })),
    manualOverrideTtlMinutes: settings.manualOverrideTtlMinutes ?? 15,
    maxAutoPostsPerHour: settings.maxAutoPostsPerHour ?? 6,
    messageTemplates: [...(settings.messageTemplates ?? [])].map(
      (template) => ({
        enabled: template.enabled ?? true,
        id: template.id,
        platforms: [...(template.platforms ?? [])],
        text: template.text,
        type: template.type,
      }),
    ),
    minimumMessageGapSeconds: settings.minimumMessageGapSeconds ?? 90,
    prioritizeYoutube: settings.prioritizeYoutube ?? true,
    scheduledCadenceMinutes: settings.scheduledCadenceMinutes ?? 10,
    targetAudience: [
      ...(settings.targetAudience ?? [BotLivestreamTargetAudience.AUDIENCE]),
    ],
    transcriptEnabled: settings.transcriptEnabled ?? true,
    transcriptLookbackMinutes: settings.transcriptLookbackMinutes ?? 3,
  };
}

export class Bot extends BaseBot {
  public declare targets: BotTarget[];
  public declare livestreamSettings?: BotLivestreamSettings;

  constructor(partial: Partial<LivestreamBot> = {}) {
    super(partial);

    this.targets = [...(partial.targets ?? [])].map((target) => ({
      channelId: target.channelId,
      channelLabel: target.channelLabel,
      channelUrl: target.channelUrl,
      credentialId: target.credentialId,
      isEnabled: target.isEnabled ?? true,
      liveChatId: target.liveChatId,
      platform: target.platform,
      senderId: target.senderId,
    }));

    this.settings = normalizeSettings(partial.settings);
    this.livestreamSettings = normalizeLivestreamSettings(
      partial.livestreamSettings,
    );
  }
}

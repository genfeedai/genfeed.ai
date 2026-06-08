import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  BotCategory,
  BotLivestreamMessageType,
  BotLivestreamTargetAudience,
  BotPlatform,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Bot, BotLivestreamSettings } from '@models/automation/bot.model';
import type { LivestreamSession } from '@models/automation/livestream-session.model';
import { BotsService } from '@services/automation/bots.service';
import { NotificationsService } from '@services/core/notifications.service';
import { startTransition, useEffect, useMemo, useState } from 'react';

export type LivestreamPagePlatform = 'youtube' | 'twitch';

export interface LivestreamFormState {
  contextTemplate: string;
  description: string;
  hostPromptTemplate: string;
  label: string;
  linkLabel: string;
  linkUrl: string;
  maxAutoPostsPerHour: number;
  minimumMessageGapSeconds: number;
  scheduledCadenceMinutes: number;
  transcriptEnabled: boolean;
  twitchChannelId: string;
  twitchCredentialId: string;
  twitchSenderId: string;
  youtubeChannelId: string;
  youtubeCredentialId: string;
  youtubeLiveChatId: string;
}

const DEFAULT_FORM_STATE: LivestreamFormState = {
  contextTemplate: 'What is your take on {{topic}} right now?',
  description:
    'Posts scheduled link drops and context-aware questions into livestream chat.',
  hostPromptTemplate:
    'Hosts, what should the audience build with this tonight?',
  label: 'Livestream Chat Bot',
  linkLabel: 'Show Notes',
  linkUrl: 'https://genfeed.ai/show-notes',
  maxAutoPostsPerHour: 6,
  minimumMessageGapSeconds: 90,
  scheduledCadenceMinutes: 10,
  transcriptEnabled: true,
  twitchChannelId: '',
  twitchCredentialId: '',
  twitchSenderId: '',
  youtubeChannelId: '',
  youtubeCredentialId: '',
  youtubeLiveChatId: '',
};

function buildLivestreamSettings(
  form: LivestreamFormState,
): BotLivestreamSettings {
  return {
    automaticPosting: true,
    links: form.linkUrl
      ? [
          {
            id: 'primary-link',
            label: form.linkLabel || 'Primary Link',
            url: form.linkUrl,
          },
        ]
      : [],
    manualOverrideTtlMinutes: 15,
    maxAutoPostsPerHour: form.maxAutoPostsPerHour,
    messageTemplates: [
      {
        enabled: true,
        id: 'scheduled-link',
        platforms: [BotPlatform.YOUTUBE, BotPlatform.TWITCH],
        text: '{{link_label}}: {{link_url}}',
        type: BotLivestreamMessageType.SCHEDULED_LINK_DROP,
      },
      {
        enabled: true,
        id: 'scheduled-host-prompt',
        platforms: [BotPlatform.YOUTUBE, BotPlatform.TWITCH],
        text: form.hostPromptTemplate,
        type: BotLivestreamMessageType.SCHEDULED_HOST_PROMPT,
      },
      {
        enabled: true,
        id: 'context-aware-question',
        platforms: [BotPlatform.YOUTUBE, BotPlatform.TWITCH],
        text: form.contextTemplate,
        type: BotLivestreamMessageType.CONTEXT_AWARE_QUESTION,
      },
    ],
    minimumMessageGapSeconds: form.minimumMessageGapSeconds,
    prioritizeYoutube: true,
    scheduledCadenceMinutes: form.scheduledCadenceMinutes,
    targetAudience: [
      BotLivestreamTargetAudience.HOSTS,
      BotLivestreamTargetAudience.AUDIENCE,
    ],
    transcriptEnabled: form.transcriptEnabled,
    transcriptLookbackMinutes: 3,
  };
}

function getPlatformTarget(bot: Bot | null, platform: LivestreamPagePlatform) {
  return bot?.targets.find((target) => target.platform === platform);
}

function getTemplateText(
  settings: BotLivestreamSettings | undefined,
  type: 'scheduled_host_prompt' | 'context_aware_question',
  fallback: string,
): string {
  return (
    settings?.messageTemplates.find((template) => template.type === type)
      ?.text ?? fallback
  );
}

function buildTargets(form: LivestreamFormState) {
  const targets: Array<{
    channelId: string;
    credentialId?: string;
    isEnabled: boolean;
    liveChatId?: string;
    platform: BotPlatform;
    senderId?: string;
  }> = [];

  if (form.youtubeChannelId) {
    targets.push({
      channelId: form.youtubeChannelId,
      credentialId: form.youtubeCredentialId || undefined,
      isEnabled: true,
      liveChatId: form.youtubeLiveChatId || undefined,
      platform: BotPlatform.YOUTUBE,
    });
  }

  if (form.twitchChannelId) {
    targets.push({
      channelId: form.twitchChannelId,
      credentialId: form.twitchCredentialId || undefined,
      isEnabled: true,
      platform: BotPlatform.TWITCH,
      senderId: form.twitchSenderId || undefined,
    });
  }

  return targets;
}

function hydrateForm(bot: Bot): LivestreamFormState {
  const youtubeTarget = getPlatformTarget(bot, 'youtube');
  const twitchTarget = getPlatformTarget(bot, 'twitch');

  return {
    contextTemplate: getTemplateText(
      bot.livestreamSettings,
      'context_aware_question',
      DEFAULT_FORM_STATE.contextTemplate,
    ),
    description: bot.description || DEFAULT_FORM_STATE.description,
    hostPromptTemplate: getTemplateText(
      bot.livestreamSettings,
      'scheduled_host_prompt',
      DEFAULT_FORM_STATE.hostPromptTemplate,
    ),
    label: bot.label || DEFAULT_FORM_STATE.label,
    linkLabel:
      bot.livestreamSettings?.links[0]?.label || DEFAULT_FORM_STATE.linkLabel,
    linkUrl:
      bot.livestreamSettings?.links[0]?.url || DEFAULT_FORM_STATE.linkUrl,
    maxAutoPostsPerHour:
      bot.livestreamSettings?.maxAutoPostsPerHour ??
      DEFAULT_FORM_STATE.maxAutoPostsPerHour,
    minimumMessageGapSeconds:
      bot.livestreamSettings?.minimumMessageGapSeconds ??
      DEFAULT_FORM_STATE.minimumMessageGapSeconds,
    scheduledCadenceMinutes:
      bot.livestreamSettings?.scheduledCadenceMinutes ??
      DEFAULT_FORM_STATE.scheduledCadenceMinutes,
    transcriptEnabled:
      bot.livestreamSettings?.transcriptEnabled ??
      DEFAULT_FORM_STATE.transcriptEnabled,
    twitchChannelId: twitchTarget?.channelId || '',
    twitchCredentialId: twitchTarget?.credentialId || '',
    twitchSenderId: twitchTarget?.senderId || '',
    youtubeChannelId: youtubeTarget?.channelId || '',
    youtubeCredentialId: youtubeTarget?.credentialId || '',
    youtubeLiveChatId: youtubeTarget?.liveChatId || '',
  };
}

export function useLivestreamChatBotPage(
  defaultPlatform: LivestreamPagePlatform,
) {
  const { brandId, organizationId } = useBrand();
  const getBotsService = useAuthedService((token: string) =>
    BotsService.getInstance(token),
  );
  const notificationsService = NotificationsService.getInstance();

  const [bot, setBot] = useState<Bot | null>(null);
  const [form, setForm] = useState<LivestreamFormState>(DEFAULT_FORM_STATE);
  const [session, setSession] = useState<LivestreamSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [manualTopic, setManualTopic] = useState('');
  const [promotionAngle, setPromotionAngle] = useState('');
  const [transcriptChunk, setTranscriptChunk] = useState('');
  const [sendNowMessage, setSendNowMessage] = useState('');
  const [selectedPlatform, setSelectedPlatform] =
    useState<LivestreamPagePlatform>(defaultPlatform);

  useEffect(() => {
    async function loadLivestreamBot() {
      if (!organizationId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const service = await getBotsService();
        const bots = await service.findAllByOrganization(organizationId);
        const existingBot =
          bots.find((candidate) =>
            candidate.platforms.some(
              (platform) =>
                platform === BotPlatform.YOUTUBE ||
                platform === BotPlatform.TWITCH,
            ),
          ) || null;

        startTransition(() => {
          setBot(existingBot);
          setForm(existingBot ? hydrateForm(existingBot) : DEFAULT_FORM_STATE);
        });

        if (existingBot) {
          const currentSession = await service.getLivestreamSession(
            existingBot.id,
          );
          startTransition(() => {
            setSession(currentSession);
          });
        }
      } catch (_error) {
        notificationsService.error(
          'Failed to load livestream bot configuration',
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadLivestreamBot();
  }, [getBotsService, notificationsService, organizationId]);

  const recentDeliveries = useMemo(
    () => (session?.deliveryHistory ?? []).slice(-5).reverse(),
    [session],
  );

  async function refreshSession(botId: string): Promise<void> {
    const service = await getBotsService();
    const nextSession = await service.getLivestreamSession(botId);
    startTransition(() => {
      setSession(nextSession);
    });
  }

  async function handleSave(): Promise<void> {
    if (!organizationId) {
      notificationsService.error('Organization context is required');
      return;
    }

    const targets = buildTargets(form);

    if (targets.length === 0) {
      notificationsService.error('Add at least one YouTube or Twitch target');
      return;
    }

    setIsSaving(true);

    try {
      const service = await getBotsService();
      const payload = {
        brand: brandId,
        category: BotCategory.CHAT,
        description: form.description,
        label: form.label,
        livestreamSettings: buildLivestreamSettings(form),
        organization: organizationId,
        platforms: [BotPlatform.YOUTUBE, BotPlatform.TWITCH],
        settings: {
          messagesPerMinute: 5,
          responseDelaySeconds: 5,
          responses: [],
          triggers: [],
        },
        targets,
      };

      const savedBot = bot
        ? await service.patch(bot.id, payload)
        : await service.post(payload);

      startTransition(() => {
        setBot(savedBot);
      });

      await refreshSession(savedBot.id);
      notificationsService.success('Livestream bot configuration saved');
    } catch (_error) {
      notificationsService.error('Failed to save livestream bot configuration');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSessionAction(
    action: 'start' | 'pause' | 'resume' | 'stop',
  ): Promise<void> {
    if (!bot) {
      notificationsService.error('Save the bot before changing session state');
      return;
    }

    const service = await getBotsService();

    try {
      const nextSession =
        action === 'start'
          ? await service.startLivestreamSession(bot.id)
          : action === 'pause'
            ? await service.pauseLivestreamSession(bot.id)
            : action === 'resume'
              ? await service.resumeLivestreamSession(bot.id)
              : await service.stopLivestreamSession(bot.id);

      startTransition(() => {
        setSession(nextSession);
      });
      notificationsService.success(`Session ${action}ed`);
    } catch (_error) {
      notificationsService.error(`Failed to ${action} livestream session`);
    }
  }

  async function handleApplyOverride(): Promise<void> {
    if (!bot) {
      notificationsService.error('Save the bot before applying an override');
      return;
    }

    try {
      const service = await getBotsService();
      const nextSession = await service.setLivestreamOverride(bot.id, {
        promotionAngle: promotionAngle || undefined,
        topic: manualTopic || undefined,
      });
      startTransition(() => {
        setSession(nextSession);
      });
      notificationsService.success('Manual override applied');
    } catch (_error) {
      notificationsService.error('Failed to apply manual override');
    }
  }

  async function handleIngestTranscript(): Promise<void> {
    if (!bot) {
      notificationsService.error(
        'Save the bot before ingesting transcript chunks',
      );
      return;
    }

    if (!transcriptChunk.trim()) {
      notificationsService.error('Enter a transcript chunk first');
      return;
    }

    try {
      const service = await getBotsService();
      const nextSession = await service.ingestTranscriptChunk(bot.id, {
        confidence: 0.8,
        text: transcriptChunk.trim(),
      });
      startTransition(() => {
        setSession(nextSession);
        setTranscriptChunk('');
      });
      notificationsService.success('Transcript chunk processed');
    } catch (_error) {
      notificationsService.error('Failed to process transcript chunk');
    }
  }

  async function handleSendNow(): Promise<void> {
    if (!bot) {
      notificationsService.error('Save the bot before sending chat messages');
      return;
    }

    try {
      const service = await getBotsService();
      const nextSession = await service.sendLivestreamMessageNow(bot.id, {
        message: sendNowMessage.trim() || undefined,
        platform: selectedPlatform,
      });
      startTransition(() => {
        setSession(nextSession);
        setSendNowMessage('');
      });
      notificationsService.success('Livestream message sent');
    } catch (_error) {
      notificationsService.error('Failed to send livestream message');
    }
  }

  return {
    form,
    handleApplyOverride,
    handleIngestTranscript,
    handleSave,
    handleSendNow,
    handleSessionAction,
    isLoading,
    isSaving,
    manualTopic,
    promotionAngle,
    recentDeliveries,
    selectedPlatform,
    sendNowMessage,
    session,
    setForm,
    setManualTopic,
    setPromotionAngle,
    setSendNowMessage,
    setSelectedPlatform,
    setTranscriptChunk,
    transcriptChunk,
  };
}

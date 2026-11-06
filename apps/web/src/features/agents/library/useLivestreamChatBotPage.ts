import {
  BotCategory,
  BotLivestreamMessageType,
  BotLivestreamTargetAudience,
  BotPlatform,
  LivestreamTranscriptSource,
  Platform,
} from '@genfeedai/contracts';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { Bot, BotLivestreamSettings } from '@models/automation/bot.model';
import type { LivestreamSession } from '@models/automation/livestream-session.model';
import { BotsService } from '@services/automation/bots.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CredentialsService } from '@services/organization/credentials.service';
import { type Query, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

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
  restreamCredentialId: string;
  scheduledCadenceMinutes: number;
  transcriptEnabled: boolean;
  transcriptSource: string;
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
  restreamCredentialId: '',
  scheduledCadenceMinutes: 10,
  transcriptEnabled: true,
  transcriptSource: LivestreamTranscriptSource.RESTREAM_CHAT,
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
    restreamCredentialId: form.restreamCredentialId || undefined,
    scheduledCadenceMinutes: form.scheduledCadenceMinutes,
    targetAudience: [
      BotLivestreamTargetAudience.HOSTS,
      BotLivestreamTargetAudience.AUDIENCE,
    ],
    transcriptEnabled: form.transcriptEnabled,
    transcriptLookbackMinutes: 3,
    transcriptSource: form.transcriptSource,
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
    restreamCredentialId:
      bot.livestreamSettings?.restreamCredentialId ||
      DEFAULT_FORM_STATE.restreamCredentialId,
    scheduledCadenceMinutes:
      bot.livestreamSettings?.scheduledCadenceMinutes ??
      DEFAULT_FORM_STATE.scheduledCadenceMinutes,
    transcriptEnabled:
      bot.livestreamSettings?.transcriptEnabled ??
      DEFAULT_FORM_STATE.transcriptEnabled,
    transcriptSource:
      bot.livestreamSettings?.transcriptSource ||
      DEFAULT_FORM_STATE.transcriptSource,
    twitchChannelId: twitchTarget?.channelId || '',
    twitchCredentialId: twitchTarget?.credentialId || '',
    twitchSenderId: twitchTarget?.senderId || '',
    youtubeChannelId: youtubeTarget?.channelId || '',
    youtubeCredentialId: youtubeTarget?.credentialId || '',
    youtubeLiveChatId: youtubeTarget?.liveChatId || '',
  };
}

function isSameLivestreamForm(
  a: LivestreamFormState,
  b: LivestreamFormState,
): boolean {
  return (Object.keys(a) as Array<keyof LivestreamFormState>).every(
    (key) => a[key] === b[key],
  );
}

export type RestreamCredentialOption = {
  id: string;
  label: string;
};

function isLivestreamBotFor(
  candidate: Bot,
  brandId: string | undefined,
): boolean {
  const isLivestreamPlatform = candidate.platforms.some(
    (platform) =>
      platform === BotPlatform.YOUTUBE || platform === BotPlatform.TWITCH,
  );
  if (!isLivestreamPlatform) {
    return false;
  }
  // Prefer brand-scoped bot when brand context is set.
  const candidateBrandId = candidate.brandId;
  if (brandId && candidateBrandId) {
    return candidateBrandId === brandId;
  }
  return true;
}

function livestreamBotsQueryKey(organizationId: string) {
  return ['livestream-chat-bot', organizationId] as const;
}

function livestreamBotQueryKey(
  organizationId: string,
  brandId: string | undefined,
) {
  return [...livestreamBotsQueryKey(organizationId), brandId ?? null] as const;
}

function livestreamSessionQueryKey(botId: string) {
  return ['livestream-session', botId] as const;
}

function restreamCredentialsQueryKey(brandId: string) {
  return ['livestream-restream-credentials', brandId] as const;
}

const EMPTY_RESTREAM_CREDENTIALS: RestreamCredentialOption[] = [];

export function useLivestreamChatBotPage(
  defaultPlatform: LivestreamPagePlatform,
) {
  const { brandId, organizationId } = useCollectionScope();
  const queryClient = useQueryClient();
  const getBotsService = useAuthedService((token: string) =>
    BotsService.getInstance(token),
  );
  const notificationsService = NotificationsService.getInstance();

  // The bot, its session and the Restream picker read through React Query, so
  // coming back to the page paints the saved configuration at once and
  // refreshes it in the background.
  const botQuery = useAuthedQuery<BotsService, Bot | null>({
    enabled: Boolean(organizationId),
    queryFn: async (service) => {
      const bots = await service.findAllByOrganization(organizationId);
      return (
        bots.find((candidate) => isLivestreamBotFor(candidate, brandId)) ?? null
      );
    },
    queryKey: livestreamBotQueryKey(organizationId, brandId),
    service: (token: string) => BotsService.getInstance(token),
  });
  const bot = botQuery.data ?? null;
  const botId = bot?.id ?? '';

  const sessionQuery = useAuthedQuery<BotsService, LivestreamSession>({
    enabled: Boolean(botId),
    queryFn: (service) => service.getLivestreamSession(botId),
    queryKey: livestreamSessionQueryKey(botId),
    service: (token: string) => BotsService.getInstance(token),
  });
  const session = botId ? (sessionQuery.data ?? null) : null;

  const restreamCredentialsQuery = useAuthedQuery<
    CredentialsService,
    RestreamCredentialOption[]
  >({
    enabled: Boolean(brandId),
    queryFn: async (service, signal) => {
      const credentials = await service.findAll(
        {
          brandId,
          isConnected: true,
          isDeleted: false,
          limit: 20,
          platform: Platform.RESTREAM,
        },
        signal,
      );
      return credentials.map((credential) => ({
        id: credential.id,
        label:
          credential.externalHandle ||
          credential.externalId ||
          `Restream ${credential.id.slice(0, 6)}`,
      }));
    },
    queryKey: restreamCredentialsQueryKey(brandId ?? ''),
    service: (token: string) => CredentialsService.getInstance(token),
  });
  // Optional picker — on a failed read the free-text id remains available.
  const restreamCredentials =
    (brandId ? restreamCredentialsQuery.data : undefined) ??
    EMPTY_RESTREAM_CREDENTIALS;

  const isLoading =
    botQuery.isLoading || (Boolean(botId) && sessionQuery.isLoading);

  const [form, setForm] = useState<LivestreamFormState>(() =>
    bot ? hydrateForm(bot) : DEFAULT_FORM_STATE,
  );
  // The bot the form was last seeded from. A fresh bot re-seeds the form while
  // it is untouched, so a background refresh never wipes what the user is
  // typing; another organization or brand always re-seeds it.
  const scopeKey = `${organizationId}:${brandId ?? ''}`;
  const [formSource, setFormSource] = useState({ bot, scopeKey });
  if (formSource.bot !== bot || formSource.scopeKey !== scopeKey) {
    setFormSource({ bot, scopeKey });
    const seededForm = formSource.bot
      ? hydrateForm(formSource.bot)
      : DEFAULT_FORM_STATE;
    if (
      formSource.scopeKey !== scopeKey ||
      isSameLivestreamForm(form, seededForm)
    ) {
      setForm(bot ? hydrateForm(bot) : DEFAULT_FORM_STATE);
    }
  }

  const [isSaving, setIsSaving] = useState(false);
  const [manualTopic, setManualTopic] = useState('');
  const [promotionAngle, setPromotionAngle] = useState('');
  const [transcriptChunk, setTranscriptChunk] = useState('');
  const [sendNowMessage, setSendNowMessage] = useState('');
  const [selectedPlatform, setSelectedPlatform] =
    useState<LivestreamPagePlatform>(defaultPlatform);

  const { error: botError } = botQuery;
  useEffect(() => {
    if (!botError) {
      return;
    }
    NotificationsService.getInstance().error(
      'Failed to load livestream bot configuration',
    );
  }, [botError]);

  const { error: sessionError } = sessionQuery;
  useEffect(() => {
    if (!sessionError) {
      return;
    }
    NotificationsService.getInstance().error(
      'Failed to load livestream bot configuration',
    );
  }, [sessionError]);

  async function writeSession(
    nextBotId: string,
    nextSession: LivestreamSession,
  ) {
    const queryKey = livestreamSessionQueryKey(nextBotId);
    // A read already in flight would land after this write and undo it.
    await queryClient.cancelQueries({ queryKey });
    queryClient.setQueriesData<LivestreamSession>({ queryKey }, nextSession);
  }

  const recentDeliveries = useMemo(
    () => (session?.deliveryHistory ?? []).slice(-5).reverse(),
    [session],
  );

  async function refreshSession(savedBotId: string): Promise<void> {
    const service = await getBotsService();
    const nextSession = await service.getLivestreamSession(savedBotId);
    await writeSession(savedBotId, nextSession);
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
      if (bot && (!bot.id || bot.id.length === 0)) {
        notificationsService.error('Bot id is required');
        return;
      }

      const service = await getBotsService();
      const payload = {
        brandId,
        category: BotCategory.CHAT,
        description: form.description,
        label: form.label,
        livestreamSettings: buildLivestreamSettings(form),
        organizationId,
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

      if (!savedBot.id) {
        notificationsService.error('Saved bot is missing an id');
        return;
      }

      await queryClient.cancelQueries({
        queryKey: livestreamBotQueryKey(organizationId, brandId),
      });
      queryClient.setQueriesData<Bot | null>(
        { queryKey: livestreamBotQueryKey(organizationId, brandId) },
        savedBot,
      );
      // The form shows what was saved, server defaults included, and counts as
      // untouched again; edits made while the save ran are kept.
      const submittedForm = form;
      setFormSource({ bot: savedBot, scopeKey });
      setForm((current) =>
        isSameLivestreamForm(current, submittedForm)
          ? hydrateForm(savedBot)
          : current,
      );
      // A bot with no brand is cached under every brand that read it: those
      // copies re-read, so another brand never edits the old configuration.
      const otherBrands = {
        predicate: (query: Query) => query.queryKey[2] !== (brandId ?? null),
        queryKey: livestreamBotsQueryKey(organizationId),
      };
      await queryClient.cancelQueries(otherBrands);
      await queryClient.invalidateQueries(otherBrands);

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
    if (!bot?.id) {
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

      await writeSession(bot.id, nextSession);
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
      await writeSession(bot.id, nextSession);
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
      await writeSession(bot.id, nextSession);
      setTranscriptChunk('');
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
      await writeSession(bot.id, nextSession);
      setSendNowMessage('');
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
    restreamCredentials,
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

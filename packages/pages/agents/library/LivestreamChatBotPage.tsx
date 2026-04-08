'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  BotCategory,
  BotLivestreamMessageType,
  BotLivestreamTargetAudience,
  BotPlatform,
  ButtonVariant,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Bot, BotLivestreamSettings } from '@models/automation/bot.model';
import type { LivestreamSession } from '@models/automation/livestream-session.model';
import { BotsService } from '@services/automation/bots.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { startTransition, useEffect, useMemo, useState } from 'react';

type LivestreamPagePlatform = 'youtube' | 'twitch';

interface LivestreamChatBotPageProps {
  defaultPlatform: LivestreamPagePlatform;
}

interface LivestreamFormState {
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

export default function LivestreamChatBotPage({
  defaultPlatform,
}: LivestreamChatBotPageProps): JSX.Element {
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

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading livestream bot...
      </div>
    );
  }

  const youtubeFirstStatus = session?.platformStates.find(
    (platformState) => platformState.platform === 'youtube',
  );
  const twitchStatus = session?.platformStates.find(
    (platformState) => platformState.platform === 'twitch',
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Livestream Chat Bot</h1>
        <p className="text-sm text-muted-foreground">
          YouTube is treated as the primary platform. Save the bot, connect the
          channel targets, then control the live session from the same screen.
        </p>
      </div>

      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Bot Label"
            value={form.label}
            onChange={(event) =>
              setForm((current) => ({ ...current, label: event.target.value }))
            }
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
          <Input
            label="Scheduled Cadence (minutes)"
            type="number"
            value={String(form.scheduledCadenceMinutes)}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                scheduledCadenceMinutes: Number(event.target.value || 10),
              }))
            }
          />
          <Input
            label="Minimum Gap (seconds)"
            type="number"
            value={String(form.minimumMessageGapSeconds)}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                minimumMessageGapSeconds: Number(event.target.value || 90),
              }))
            }
          />
          <Input
            label="Max Auto Posts Per Hour"
            type="number"
            value={String(form.maxAutoPostsPerHour)}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                maxAutoPostsPerHour: Number(event.target.value || 6),
              }))
            }
          />
          <label className="flex items-center gap-3 pt-7 text-sm">
            <Checkbox
              checked={form.transcriptEnabled}
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  transcriptEnabled: Boolean(checked),
                }))
              }
            />
            Transcript-assisted context enabled
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Input
            label="Primary Link Label"
            value={form.linkLabel}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                linkLabel: event.target.value,
              }))
            }
          />
          <Input
            label="Primary Link URL"
            value={form.linkUrl}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                linkUrl: event.target.value,
              }))
            }
          />
          <Textarea
            label="Scheduled Host Prompt Template"
            value={form.hostPromptTemplate}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                hostPromptTemplate: event.target.value,
              }))
            }
          />
          <Textarea
            label="Context-Aware Question Template"
            value={form.contextTemplate}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                contextTemplate: event.target.value,
              }))
            }
          />
        </div>

        <div className="mt-6 flex justify-end">
          <Button
            isLoading={isSaving}
            label="Save Bot Configuration"
            variant={ButtonVariant.DEFAULT}
            onClick={() => void handleSave()}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">YouTube Live</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Primary delivery target for the show.
          </p>
          <div className="grid gap-4">
            <Input
              label="YouTube Channel ID"
              value={form.youtubeChannelId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  youtubeChannelId: event.target.value,
                }))
              }
            />
            <Input
              label="YouTube Credential ID"
              value={form.youtubeCredentialId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  youtubeCredentialId: event.target.value,
                }))
              }
            />
            <Input
              label="Resolved Live Chat ID"
              value={form.youtubeLiveChatId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  youtubeLiveChatId: event.target.value,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Last YouTube delivery:{' '}
              {youtubeFirstStatus?.lastPostedAt || 'None yet'}
            </p>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">Twitch</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Secondary delivery target for simultaneous streams.
          </p>
          <div className="grid gap-4">
            <Input
              label="Twitch Broadcaster ID"
              value={form.twitchChannelId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  twitchChannelId: event.target.value,
                }))
              }
            />
            <Input
              label="Twitch Credential ID"
              value={form.twitchCredentialId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  twitchCredentialId: event.target.value,
                }))
              }
            />
            <Input
              label="Twitch Sender ID"
              value={form.twitchSenderId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  twitchSenderId: event.target.value,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Last Twitch delivery: {twitchStatus?.lastPostedAt || 'None yet'}
            </p>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Runtime Controls</h2>
            <p className="text-sm text-muted-foreground">
              Session status: {session?.status || 'stopped'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              label="Start"
              variant={ButtonVariant.DEFAULT}
              onClick={() => void handleSessionAction('start')}
            />
            <Button
              label="Pause"
              variant={ButtonVariant.SECONDARY}
              onClick={() => void handleSessionAction('pause')}
            />
            <Button
              label="Resume"
              variant={ButtonVariant.SECONDARY}
              onClick={() => void handleSessionAction('resume')}
            />
            <Button
              label="Stop"
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={() => void handleSessionAction('stop')}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <h3 className="font-medium">Manual Override</h3>
            <Input
              label="Current Topic"
              value={manualTopic}
              onChange={(event) => setManualTopic(event.target.value)}
            />
            <Input
              label="Promotion Angle"
              value={promotionAngle}
              onChange={(event) => setPromotionAngle(event.target.value)}
            />
            <Button
              label="Apply Override"
              variant={ButtonVariant.SECONDARY}
              onClick={() => void handleApplyOverride()}
            />
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">Transcript Ingestion</h3>
            <Textarea
              label="Transcript Chunk"
              value={transcriptChunk}
              onChange={(event) => setTranscriptChunk(event.target.value)}
            />
            <Button
              label="Process Transcript"
              variant={ButtonVariant.SECONDARY}
              onClick={() => void handleIngestTranscript()}
            />
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">Send One-Off Message</h3>
            <div className="flex gap-2">
              <Button
                label="YouTube"
                variant={
                  selectedPlatform === 'youtube'
                    ? ButtonVariant.DEFAULT
                    : ButtonVariant.SECONDARY
                }
                onClick={() => setSelectedPlatform('youtube')}
              />
              <Button
                label="Twitch"
                variant={
                  selectedPlatform === 'twitch'
                    ? ButtonVariant.DEFAULT
                    : ButtonVariant.SECONDARY
                }
                onClick={() => setSelectedPlatform('twitch')}
              />
            </div>
            <Textarea
              label="Message"
              placeholder="Leave blank to let the bot generate the next prompt."
              value={sendNowMessage}
              onChange={(event) => setSendNowMessage(event.target.value)}
            />
            <Button
              label="Send Now"
              variant={ButtonVariant.DEFAULT}
              onClick={() => void handleSendNow()}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Current Context</h2>
          <div className="mt-4 space-y-2 text-sm">
            <p>
              <span className="font-medium">Source:</span>{' '}
              {session?.context.source || 'none'}
            </p>
            <p>
              <span className="font-medium">Topic:</span>{' '}
              {session?.context.currentTopic || 'No active topic'}
            </p>
            <p>
              <span className="font-medium">Summary:</span>{' '}
              {session?.context.transcriptSummary ||
                'No transcript summary yet'}
            </p>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">Recent Deliveries</h2>
          <div className="mt-4 space-y-3">
            {recentDeliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No delivery events yet.
              </p>
            ) : (
              recentDeliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  className="rounded-lg border border-white/[0.08] p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {delivery.platform.toUpperCase()} · {delivery.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {delivery.createdAt || 'just now'}
                    </span>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    {delivery.message}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

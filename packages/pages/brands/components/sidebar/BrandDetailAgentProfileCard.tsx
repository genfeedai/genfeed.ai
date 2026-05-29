'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import type {
  IBrandAgentPlatformOverride,
  IBrandAgentStrategy,
  IBrandAgentVoice,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import type { BrandDetailAgentProfileCardProps } from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BrandsService } from '@services/social/brands.service';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AgentProfilePlatformOverride from './AgentProfilePlatformOverride';
import AgentProfileSummaryCard from './AgentProfileSummaryCard';
import AgentProfileVoiceFields from './AgentProfileVoiceFields';

type AgentProfileFormState = {
  defaultModel: string;
  frequency: string;
  persona: string;
  platformOverrides: Record<string, PlatformOverrideFormState>;
  strategyContentTypes: string;
  strategyGoals: string;
  strategyPlatforms: string;
  voiceApprovedHooks: string;
  voiceAudience: string;
  voiceBannedPhrases: string;
  voiceCanonicalSource: 'brand' | 'founder' | 'hybrid';
  voiceDoNotSoundLike: string;
  voiceExemplarTexts: string;
  voiceMessagingPillars: string;
  voiceSampleOutput: string;
  voiceStyle: string;
  voiceTone: string;
  voiceValues: string;
  voiceWritingRules: string;
};

type PlatformOverrideFormState = {
  approvedHooks: string;
  contentTypes: string;
  defaultModel: string;
  bannedPhrases: string;
  canonicalSource: 'brand' | 'founder' | 'hybrid' | '';
  doNotSoundLike: string;
  exemplarTexts: string;
  frequency: string;
  goals: string;
  messagingPillars: string;
  persona: string;
  sampleOutput: string;
  style: string;
  tone: string;
  audience: string;
  values: string;
  writingRules: string;
};

const AUTO_MODEL_SELECT_VALUE = '__auto__';
const PLATFORM_OPTIONS = [
  { label: 'Twitter / X', value: 'twitter' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'TikTok', value: 'tiktok' },
];

function joinList(values?: string[] | string): string {
  if (Array.isArray(values)) {
    return values.join(', ');
  }

  return values ?? '';
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toPlatformOverrideFormState(
  override?: IBrandAgentPlatformOverride,
): PlatformOverrideFormState {
  const overrideVoice = override?.voice as
    | (IBrandAgentPlatformOverride['voice'] & {
        approvedHooks?: string[];
        bannedPhrases?: string[];
        canonicalSource?: 'brand' | 'founder' | 'hybrid';
        doNotSoundLike?: string[];
        exemplarTexts?: string[];
        messagingPillars?: string[];
        sampleOutput?: string;
        writingRules?: string[];
      })
    | undefined;

  return {
    approvedHooks: joinList(overrideVoice?.approvedHooks),
    audience: joinList(override?.voice?.audience),
    bannedPhrases: joinList(overrideVoice?.bannedPhrases),
    canonicalSource: overrideVoice?.canonicalSource ?? '',
    contentTypes: joinList(override?.strategy?.contentTypes),
    defaultModel: override?.defaultModel ?? '',
    doNotSoundLike: joinList(overrideVoice?.doNotSoundLike),
    exemplarTexts: joinList(overrideVoice?.exemplarTexts),
    frequency: override?.strategy?.frequency ?? '',
    goals: joinList(override?.strategy?.goals),
    messagingPillars: joinList(overrideVoice?.messagingPillars),
    persona: override?.persona ?? '',
    sampleOutput: overrideVoice?.sampleOutput ?? '',
    style: override?.voice?.style ?? '',
    tone: override?.voice?.tone ?? '',
    values: joinList(override?.voice?.values),
    writingRules: joinList(overrideVoice?.writingRules),
  };
}

function toFormState(brand: BrandDetailAgentProfileCardProps['brand']) {
  const config = brand.agentConfig;

  return {
    defaultModel: config?.defaultModel ?? '',
    frequency: config?.strategy?.frequency ?? '',
    persona: config?.persona ?? '',
    platformOverrides: Object.fromEntries(
      PLATFORM_OPTIONS.map((platform) => [
        platform.value,
        toPlatformOverrideFormState(
          config?.platformOverrides?.[platform.value],
        ),
      ]),
    ),
    strategyContentTypes: joinList(config?.strategy?.contentTypes),
    strategyGoals: joinList(config?.strategy?.goals),
    strategyPlatforms: joinList(config?.strategy?.platforms),
    voiceApprovedHooks: joinList(config?.voice?.approvedHooks),
    voiceAudience: joinList(config?.voice?.audience),
    voiceBannedPhrases: joinList(config?.voice?.bannedPhrases),
    voiceCanonicalSource: config?.voice?.canonicalSource ?? 'brand',
    voiceDoNotSoundLike: joinList(
      (config?.voice as { doNotSoundLike?: string[] } | undefined)
        ?.doNotSoundLike,
    ),
    voiceExemplarTexts: joinList(config?.voice?.exemplarTexts),
    voiceMessagingPillars: joinList(
      (config?.voice as { messagingPillars?: string[] } | undefined)
        ?.messagingPillars,
    ),
    voiceSampleOutput:
      (config?.voice as { sampleOutput?: string } | undefined)?.sampleOutput ??
      '',
    voiceStyle: config?.voice?.style ?? '',
    voiceTone: config?.voice?.tone ?? '',
    voiceValues: joinList(config?.voice?.values),
    voiceWritingRules: joinList(config?.voice?.writingRules),
  };
}

function buildVoice(
  canonicalSource: 'brand' | 'founder' | 'hybrid',
  tone: string,
  style: string,
  audience: string,
  values: string,
  messagingPillars: string,
  doNotSoundLike: string,
  sampleOutput: string,
  approvedHooks: string,
  bannedPhrases: string,
  writingRules: string,
  exemplarTexts: string,
): IBrandAgentVoice {
  return {
    approvedHooks: parseList(approvedHooks),
    audience: parseList(audience),
    bannedPhrases: parseList(bannedPhrases),
    canonicalSource,
    doNotSoundLike: parseList(doNotSoundLike),
    exemplarTexts: parseList(exemplarTexts),
    messagingPillars: parseList(messagingPillars),
    sampleOutput: sampleOutput.trim(),
    style: style.trim(),
    tone: tone.trim(),
    values: parseList(values),
    writingRules: parseList(writingRules),
  } as IBrandAgentVoice;
}

function buildStrategy(
  contentTypes: string,
  platforms: string,
  frequency: string,
  goals: string,
): IBrandAgentStrategy {
  return {
    contentTypes: parseList(contentTypes),
    frequency: frequency.trim(),
    goals: parseList(goals),
    platforms: parseList(platforms),
  };
}

function hasPlatformOverrideContent(
  override: PlatformOverrideFormState,
): boolean {
  return Boolean(
    override.persona ||
      override.defaultModel ||
      override.canonicalSource ||
      override.tone ||
      override.style ||
      override.audience ||
      override.approvedHooks ||
      override.bannedPhrases ||
      override.messagingPillars ||
      override.doNotSoundLike ||
      override.sampleOutput ||
      override.exemplarTexts ||
      override.values ||
      override.writingRules ||
      override.contentTypes ||
      override.goals ||
      override.frequency,
  );
}

function summarizeValue(value: string, fallback: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed.length > 96 ? `${trimmed.slice(0, 93)}...` : trimmed;
}

export default function BrandDetailAgentProfileCard({
  brand,
  brandId,
  onRefreshBrand,
}: BrandDetailAgentProfileCardProps) {
  const notifications = NotificationsService.getInstance();
  const { refreshBrands } = useBrand();
  const { settings } = useOrganization();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<AgentProfileFormState>(() =>
    toFormState(brand),
  );
  const [isSaving, setIsSaving] = useState(false);

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  useEffect(() => {
    setForm(toFormState(brand));
  }, [brand]);

  const enabledModels = settings?.enabledModels ?? [];
  const populatedPlatformCount = useMemo(
    () =>
      Object.values(form.platformOverrides).filter(hasPlatformOverrideContent)
        .length,
    [form.platformOverrides],
  );

  const handlePlatformOverrideChange = useCallback(
    (platform: string, key: keyof PlatformOverrideFormState, value: string) => {
      setForm((prev) => ({
        ...prev,
        platformOverrides: {
          ...prev.platformOverrides,
          [platform]: {
            ...prev.platformOverrides[platform],
            [key]: value,
          },
        },
      }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const service = await getBrandsService();
      await service.updateAgentConfig(brandId, {
        defaultModel: form.defaultModel || undefined,
        persona: form.persona,
        platformOverrides: Object.fromEntries(
          Object.entries(form.platformOverrides)
            .filter(([, override]) => hasPlatformOverrideContent(override))
            .map(([platform, override]) => [
              platform,
              {
                defaultModel: override.defaultModel || undefined,
                persona: override.persona,
                strategy: {
                  contentTypes: parseList(override.contentTypes),
                  frequency: override.frequency.trim(),
                  goals: parseList(override.goals),
                  platforms: [platform],
                },
                voice: {
                  approvedHooks: parseList(override.approvedHooks),
                  audience: parseList(override.audience),
                  bannedPhrases: parseList(override.bannedPhrases),
                  canonicalSource: override.canonicalSource || undefined,
                  doNotSoundLike: parseList(override.doNotSoundLike),
                  exemplarTexts: parseList(override.exemplarTexts),
                  messagingPillars: parseList(override.messagingPillars),
                  sampleOutput: override.sampleOutput.trim(),
                  style: override.style.trim(),
                  tone: override.tone.trim(),
                  values: parseList(override.values),
                  writingRules: parseList(override.writingRules),
                },
              },
            ]),
        ),
        strategy: buildStrategy(
          form.strategyContentTypes,
          form.strategyPlatforms,
          form.frequency,
          form.strategyGoals,
        ),
        voice: buildVoice(
          form.voiceCanonicalSource,
          form.voiceTone,
          form.voiceStyle,
          form.voiceAudience,
          form.voiceValues,
          form.voiceMessagingPillars,
          form.voiceDoNotSoundLike,
          form.voiceSampleOutput,
          form.voiceApprovedHooks,
          form.voiceBannedPhrases,
          form.voiceWritingRules,
          form.voiceExemplarTexts,
        ),
      });
      await refreshBrands();
      await onRefreshBrand();
      setIsDialogOpen(false);
      notifications.success('Brand agent profile saved');
    } catch (error) {
      logger.error('Failed to save brand agent profile', error);
      notifications.error('Failed to save brand agent profile');
    } finally {
      setIsSaving(false);
    }
  }, [
    brandId,
    form,
    getBrandsService,
    notifications,
    onRefreshBrand,
    refreshBrands,
  ]);

  const summaryItems = useMemo(
    () => [
      {
        label: 'Persona',
        value: summarizeValue(
          form.persona,
          'No brand-level persona configured yet.',
        ),
      },
      {
        label: 'Voice',
        value: summarizeValue(
          [form.voiceTone, form.voiceStyle].filter(Boolean).join(' • '),
          'Tone and style inherit from the default workspace voice.',
        ),
      },
      {
        label: 'Content Strategy',
        value: summarizeValue(
          [form.strategyContentTypes, form.strategyGoals]
            .filter(Boolean)
            .join(' • '),
          'No content types or goals configured yet.',
        ),
      },
      {
        label: 'Platform Overrides',
        value:
          populatedPlatformCount > 0
            ? `${populatedPlatformCount} platform override${populatedPlatformCount === 1 ? '' : 's'} configured.`
            : 'No platform-specific overrides configured.',
      },
    ],
    [
      form.persona,
      form.strategyContentTypes,
      form.strategyGoals,
      form.voiceStyle,
      form.voiceTone,
      populatedPlatformCount,
    ],
  );

  return (
    <>
      <AgentProfileSummaryCard
        onManage={() => setIsDialogOpen(true)}
        summaryItems={summaryItems}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agent Profile</DialogTitle>
            <DialogDescription>
              Configure the brand-level persona, voice, strategy, and optional
              per-platform overrides used by autonomous agents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-persona"
                >
                  Persona
                </label>
                <Textarea
                  id="brand-agent-persona"
                  className="min-h-[120px]"
                  placeholder="What should this brand's agents optimize for?"
                  value={form.persona}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      persona: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-default-model"
                >
                  Brand Content Generation Model Override
                </label>
                <Select
                  value={form.defaultModel || AUTO_MODEL_SELECT_VALUE}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      defaultModel:
                        value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger
                    id="brand-agent-default-model"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                      Auto
                    </SelectItem>
                    {enabledModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Auto inherits the organization content generation model. Use a
                  brand override only when this brand should write with a
                  different baseline model.
                </p>
              </div>
            </div>

            <AgentProfileVoiceFields
              voiceCanonicalSource={form.voiceCanonicalSource}
              voiceTone={form.voiceTone}
              voiceStyle={form.voiceStyle}
              voiceAudience={form.voiceAudience}
              voiceValues={form.voiceValues}
              voiceMessagingPillars={form.voiceMessagingPillars}
              voiceDoNotSoundLike={form.voiceDoNotSoundLike}
              voiceApprovedHooks={form.voiceApprovedHooks}
              voiceBannedPhrases={form.voiceBannedPhrases}
              voiceWritingRules={form.voiceWritingRules}
              voiceExemplarTexts={form.voiceExemplarTexts}
              voiceSampleOutput={form.voiceSampleOutput}
              onCanonicalSourceChange={(value) =>
                setForm((prev) => ({ ...prev, voiceCanonicalSource: value }))
              }
              onToneChange={(value) =>
                setForm((prev) => ({ ...prev, voiceTone: value }))
              }
              onStyleChange={(value) =>
                setForm((prev) => ({ ...prev, voiceStyle: value }))
              }
              onAudienceChange={(value) =>
                setForm((prev) => ({ ...prev, voiceAudience: value }))
              }
              onValuesChange={(value) =>
                setForm((prev) => ({ ...prev, voiceValues: value }))
              }
              onMessagingPillarsChange={(value) =>
                setForm((prev) => ({ ...prev, voiceMessagingPillars: value }))
              }
              onDoNotSoundLikeChange={(value) =>
                setForm((prev) => ({ ...prev, voiceDoNotSoundLike: value }))
              }
              onApprovedHooksChange={(value) =>
                setForm((prev) => ({ ...prev, voiceApprovedHooks: value }))
              }
              onBannedPhrasesChange={(value) =>
                setForm((prev) => ({ ...prev, voiceBannedPhrases: value }))
              }
              onWritingRulesChange={(value) =>
                setForm((prev) => ({ ...prev, voiceWritingRules: value }))
              }
              onExemplarTextsChange={(value) =>
                setForm((prev) => ({ ...prev, voiceExemplarTexts: value }))
              }
              onSampleOutputChange={(value) =>
                setForm((prev) => ({ ...prev, voiceSampleOutput: value }))
              }
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-content-types"
                >
                  Content Types
                </label>
                <Input
                  id="brand-agent-content-types"
                  placeholder="thread, short video, article"
                  value={form.strategyContentTypes}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      strategyContentTypes: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-platforms"
                >
                  Target Platforms
                </label>
                <Input
                  id="brand-agent-platforms"
                  placeholder="twitter, linkedin, youtube"
                  value={form.strategyPlatforms}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      strategyPlatforms: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-frequency"
                >
                  Frequency
                </label>
                <Input
                  id="brand-agent-frequency"
                  placeholder="daily"
                  value={form.frequency}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      frequency: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-goals"
                >
                  Goals
                </label>
                <Input
                  id="brand-agent-goals"
                  placeholder="awareness, lead gen"
                  value={form.strategyGoals}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      strategyGoals: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Platform Overrides</h3>
                <p className="text-xs text-muted-foreground">
                  {populatedPlatformCount} platform overrides configured. Use
                  these to tune persona, tone, and routing per channel.
                </p>
              </div>

              <div className="space-y-4">
                {PLATFORM_OPTIONS.map((platform) => (
                  <AgentProfilePlatformOverride
                    key={platform.value}
                    enabledModels={enabledModels}
                    label={platform.label}
                    override={form.platformOverrides[platform.value]}
                    platformValue={platform.value}
                    onChange={handlePlatformOverrideChange}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={() => setIsDialogOpen(false)}
              isDisabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              label="Save Agent Profile"
              onClick={handleSave}
              isLoading={isSaving}
              isDisabled={isSaving}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

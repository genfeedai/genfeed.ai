'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
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
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
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

type AgentProfileFormState = {
  defaultModel: string;
  frequency: string;
  persona: string;
  platformOverrides: Record<string, PlatformOverrideFormState>;
  strategyContentTypes: string;
  strategyGoals: string;
  strategyPlatforms: string;
  voiceAudience: string;
  voiceDoNotSoundLike: string;
  voiceMessagingPillars: string;
  voiceSampleOutput: string;
  voiceStyle: string;
  voiceTone: string;
  voiceValues: string;
};

type PlatformOverrideFormState = {
  contentTypes: string;
  defaultModel: string;
  doNotSoundLike: string;
  frequency: string;
  goals: string;
  messagingPillars: string;
  persona: string;
  sampleOutput: string;
  style: string;
  tone: string;
  audience: string;
  values: string;
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
        doNotSoundLike?: string[];
        messagingPillars?: string[];
        sampleOutput?: string;
      })
    | undefined;

  return {
    audience: joinList(override?.voice?.audience),
    contentTypes: joinList(override?.strategy?.contentTypes),
    defaultModel: override?.defaultModel ?? '',
    doNotSoundLike: joinList(overrideVoice?.doNotSoundLike),
    frequency: override?.strategy?.frequency ?? '',
    goals: joinList(override?.strategy?.goals),
    messagingPillars: joinList(overrideVoice?.messagingPillars),
    persona: override?.persona ?? '',
    sampleOutput: overrideVoice?.sampleOutput ?? '',
    style: override?.voice?.style ?? '',
    tone: override?.voice?.tone ?? '',
    values: joinList(override?.voice?.values),
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
    voiceAudience: joinList(config?.voice?.audience),
    voiceDoNotSoundLike: joinList(
      (config?.voice as { doNotSoundLike?: string[] } | undefined)
        ?.doNotSoundLike,
    ),
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
  };
}

function buildVoice(
  tone: string,
  style: string,
  audience: string,
  values: string,
  messagingPillars: string,
  doNotSoundLike: string,
  sampleOutput: string,
): IBrandAgentVoice {
  return {
    audience: parseList(audience),
    doNotSoundLike: parseList(doNotSoundLike),
    messagingPillars: parseList(messagingPillars),
    sampleOutput: sampleOutput.trim(),
    style: style.trim(),
    tone: tone.trim(),
    values: parseList(values),
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
      override.tone ||
      override.style ||
      override.audience ||
      override.messagingPillars ||
      override.doNotSoundLike ||
      override.sampleOutput ||
      override.values ||
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

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/30 p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm text-foreground/90">{value}</p>
    </div>
  );
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
                  audience: parseList(override.audience),
                  doNotSoundLike: parseList(override.doNotSoundLike),
                  messagingPillars: parseList(override.messagingPillars),
                  sampleOutput: override.sampleOutput.trim(),
                  style: override.style.trim(),
                  tone: override.tone.trim(),
                  values: parseList(override.values),
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
          form.voiceTone,
          form.voiceStyle,
          form.voiceAudience,
          form.voiceValues,
          form.voiceMessagingPillars,
          form.voiceDoNotSoundLike,
          form.voiceSampleOutput,
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
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Agent Profile</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Set the brand-level persona, voice, strategy, and platform
                overrides used by autonomous agents and content runs.
              </p>
            </div>

            <Button
              onClick={() => setIsDialogOpen(true)}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            >
              Manage
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {summaryItems.map((item) => (
              <SummaryItem
                key={item.label}
                label={item.label}
                value={item.value}
              />
            ))}
          </div>
        </div>
      </Card>

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

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-tone"
                >
                  Tone
                </label>
                <Input
                  id="brand-agent-tone"
                  value={form.voiceTone}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      voiceTone: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-style"
                >
                  Style
                </label>
                <Input
                  id="brand-agent-style"
                  value={form.voiceStyle}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      voiceStyle: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-audience"
                >
                  Audience
                </label>
                <Input
                  id="brand-agent-audience"
                  placeholder="founders, marketers"
                  value={form.voiceAudience}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      voiceAudience: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-values"
                >
                  Values
                </label>
                <Input
                  id="brand-agent-values"
                  placeholder="clarity, speed"
                  value={form.voiceValues}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      voiceValues: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-messaging-pillars"
                >
                  Messaging Pillars
                </label>
                <Input
                  id="brand-agent-messaging-pillars"
                  placeholder="clarity, proof, systems thinking"
                  value={form.voiceMessagingPillars}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      voiceMessagingPillars: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-do-not-sound-like"
                >
                  Do Not Sound Like
                </label>
                <Input
                  id="brand-agent-do-not-sound-like"
                  placeholder="buzzwords, hype-heavy copy, corporate jargon"
                  value={form.voiceDoNotSoundLike}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      voiceDoNotSoundLike: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="brand-agent-sample-output"
              >
                Sample Output
              </label>
              <Textarea
                id="brand-agent-sample-output"
                className="min-h-[120px]"
                placeholder="Write a representative example of how this brand should sound."
                value={form.voiceSampleOutput}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    voiceSampleOutput: event.target.value,
                  }))
                }
              />
            </div>

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
                {PLATFORM_OPTIONS.map((platform) => {
                  const override = form.platformOverrides[platform.value];
                  return (
                    <div
                      key={platform.value}
                      className="space-y-4 rounded-lg border border-border p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-medium">
                          {platform.label}
                        </h4>
                        <span className="text-xs text-muted-foreground">
                          Optional override
                        </span>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium">
                            Model Override
                          </label>
                          <Select
                            value={
                              override.defaultModel || AUTO_MODEL_SELECT_VALUE
                            }
                            onValueChange={(value) =>
                              handlePlatformOverrideChange(
                                platform.value,
                                'defaultModel',
                                value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                              )
                            }
                          >
                            <SelectTrigger className="w-full">
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
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium">
                            Tone Override
                          </label>
                          <Input
                            value={override.tone}
                            onChange={(event) =>
                              handlePlatformOverrideChange(
                                platform.value,
                                'tone',
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium">
                            Style Override
                          </label>
                          <Input
                            value={override.style}
                            onChange={(event) =>
                              handlePlatformOverrideChange(
                                platform.value,
                                'style',
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium">
                            Frequency Override
                          </label>
                          <Input
                            value={override.frequency}
                            onChange={(event) =>
                              handlePlatformOverrideChange(
                                platform.value,
                                'frequency',
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium">
                            Audience Override
                          </label>
                          <Input
                            placeholder="developers, operators"
                            value={override.audience}
                            onChange={(event) =>
                              handlePlatformOverrideChange(
                                platform.value,
                                'audience',
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium">
                            Goals Override
                          </label>
                          <Input
                            placeholder="engagement, leads"
                            value={override.goals}
                            onChange={(event) =>
                              handlePlatformOverrideChange(
                                platform.value,
                                'goals',
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium">
                            Messaging Pillars Override
                          </label>
                          <Input
                            placeholder="clarity, proof"
                            value={override.messagingPillars}
                            onChange={(event) =>
                              handlePlatformOverrideChange(
                                platform.value,
                                'messagingPillars',
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium">
                            Avoid Override
                          </label>
                          <Input
                            placeholder="clickbait, jargon"
                            value={override.doNotSoundLike}
                            onChange={(event) =>
                              handlePlatformOverrideChange(
                                platform.value,
                                'doNotSoundLike',
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs font-medium">
                            Content Types Override
                          </label>
                          <Input
                            placeholder="thread, reel, explainer"
                            value={override.contentTypes}
                            onChange={(event) =>
                              handlePlatformOverrideChange(
                                platform.value,
                                'contentTypes',
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs font-medium">
                            Persona Override
                          </label>
                          <Textarea
                            className="min-h-[90px]"
                            value={override.persona}
                            onChange={(event) =>
                              handlePlatformOverrideChange(
                                platform.value,
                                'persona',
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs font-medium">
                            Sample Output Override
                          </label>
                          <Textarea
                            className="min-h-[90px]"
                            placeholder="Short example of how this platform-specific voice should sound."
                            value={override.sampleOutput}
                            onChange={(event) =>
                              handlePlatformOverrideChange(
                                platform.value,
                                'sampleOutput',
                                event.target.value,
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
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

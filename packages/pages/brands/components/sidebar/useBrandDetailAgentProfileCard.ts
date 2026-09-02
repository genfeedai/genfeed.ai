import { useBrand } from '@contexts/user/brand-context/brand-context';
import { LinkCategory } from '@genfeedai/contracts';
import type {
  IBrandAgentPlatformOverride,
  IBrandAgentStrategy,
  IBrandAgentVoice,
  IGeneratedBrandProfile,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { useSaveQueue } from '@hooks/utils/use-save-queue/use-save-queue';
import type {
  AgentProfileFormState,
  AgentProfilePlatformOverrideFormState,
  AgentProfilePlatformOverrideSelectField,
  AgentProfilePlatformOverrideTextField,
  AgentProfileTextField,
  BrandDetailAgentProfileCardProps,
} from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BrandsService } from '@services/social/brands.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const AUTO_MODEL_SELECT_VALUE = '__auto__';
export const PLATFORM_OPTIONS = [
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

export const EMPTY_PLATFORM_OVERRIDE: AgentProfilePlatformOverrideFormState = {
  approvedHooks: '',
  audience: '',
  bannedPhrases: '',
  canonicalSource: '',
  contentTypes: '',
  defaultModel: '',
  doNotSoundLike: '',
  exemplarTexts: '',
  frequency: '',
  goals: '',
  messagingPillars: '',
  persona: '',
  sampleOutput: '',
  style: '',
  tone: '',
  values: '',
  writingRules: '',
};

function toPlatformOverrideFormState(
  override?: IBrandAgentPlatformOverride,
): AgentProfilePlatformOverrideFormState {
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

export function hasPlatformOverrideContent(
  override: AgentProfilePlatformOverrideFormState,
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

function applyGeneratedProfileToForm(
  current: AgentProfileFormState,
  profile: IGeneratedBrandProfile,
  brandLabel?: string,
): AgentProfileFormState {
  const audience = joinList(profile.audience);
  const tone = profile.tone?.trim() ?? '';
  const style = profile.style?.trim() ?? '';
  const personaSeed = [
    brandLabel ? `Agents for ${brandLabel}` : 'Brand agents',
    tone && `sound ${tone}`,
    style && `write in a ${style} style`,
    audience && `for ${audience}`,
  ]
    .filter(Boolean)
    .join(' that ');

  return {
    ...current,
    persona: current.persona.trim() || personaSeed,
    strategyContentTypes:
      joinList(profile.strategy?.topics) || current.strategyContentTypes,
    strategyGoals: joinList(profile.strategy?.goals) || current.strategyGoals,
    voiceAudience: audience || current.voiceAudience,
    voiceDoNotSoundLike:
      joinList(profile.doNotSoundLike) || current.voiceDoNotSoundLike,
    voiceMessagingPillars:
      joinList(profile.messagingPillars) || current.voiceMessagingPillars,
    voiceSampleOutput:
      profile.sampleOutput?.trim() || current.voiceSampleOutput,
    voiceStyle: style || current.voiceStyle,
    voiceTone: tone || current.voiceTone,
    voiceValues: joinList(profile.values) || current.voiceValues,
    // Prefer generated taglines as approved hooks when none are set yet.
    voiceApprovedHooks:
      current.voiceApprovedHooks.trim() || joinList(profile.taglines),
  };
}

function buildAgentConfigPayload(form: AgentProfileFormState) {
  return {
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
  };
}

export function useBrandDetailAgentProfileCard({
  brand,
  brandId,
  onRefreshBrand,
}: BrandDetailAgentProfileCardProps) {
  const notifications = NotificationsService.getInstance();
  const { refreshBrands } = useBrand();
  const { settings } = useOrganization();
  const [form, setForm] = useState<AgentProfileFormState>(() =>
    toFormState(brand),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const formRef = useRef(form);
  const { enqueueSave, waitForIdle } = useSaveQueue();

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  useEffect(() => {
    const nextForm = toFormState(brand);
    formRef.current = nextForm;
    setForm(nextForm);
  }, [brand]);

  const enabledModelIds = settings?.enabledModelIds ?? [];
  const populatedPlatformCount = useMemo(
    () =>
      Object.values(form.platformOverrides).filter(hasPlatformOverrideContent)
        .length,
    [form.platformOverrides],
  );

  const enqueueFormSave = useCallback(
    (
      updateForm: (current: AgentProfileFormState) => AgentProfileFormState,
    ): Promise<void> =>
      enqueueSave(async () => {
        const previousForm = formRef.current;
        const nextForm = updateForm(previousForm);

        formRef.current = nextForm;
        setForm(nextForm);

        try {
          const service = await getBrandsService();
          await service.updateAgentConfig(
            brandId,
            buildAgentConfigPayload(nextForm),
          );
          await refreshBrands();
          await onRefreshBrand();
        } catch (error) {
          formRef.current = previousForm;
          setForm(previousForm);
          logger.error('Failed to save brand agent profile field', error);
          notifications.error('Failed to save brand voice');
          throw error;
        }
      }),
    [
      brandId,
      enqueueSave,
      getBrandsService,
      notifications,
      onRefreshBrand,
      refreshBrands,
    ],
  );

  const handleFieldSave = useCallback(
    (field: AgentProfileTextField, value: string) =>
      enqueueFormSave((current) => ({
        ...current,
        [field]: value,
      })),
    [enqueueFormSave],
  );

  const handleDefaultModelChange = useCallback(
    (value: string) => {
      void enqueueFormSave((current) => ({
        ...current,
        defaultModel: value,
      })).catch(() => undefined);
    },
    [enqueueFormSave],
  );

  const handleCanonicalSourceChange = useCallback(
    (value: AgentProfileFormState['voiceCanonicalSource']) => {
      void enqueueFormSave((current) => ({
        ...current,
        voiceCanonicalSource: value,
      })).catch(() => undefined);
    },
    [enqueueFormSave],
  );

  const handlePlatformOverrideSave = useCallback(
    (
      platform: string,
      field: AgentProfilePlatformOverrideTextField,
      value: string,
    ) =>
      enqueueFormSave((current) => ({
        ...current,
        platformOverrides: {
          ...current.platformOverrides,
          [platform]: {
            ...current.platformOverrides[platform],
            [field]: value,
          },
        },
      })),
    [enqueueFormSave],
  );

  const handlePlatformOverrideSelectChange = useCallback(
    (
      platform: string,
      field: AgentProfilePlatformOverrideSelectField,
      value: string,
    ) => {
      void enqueueFormSave((current) => ({
        ...current,
        platformOverrides: {
          ...current.platformOverrides,
          [platform]: {
            ...current.platformOverrides[platform],
            [field]: value,
          },
        },
      })).catch(() => undefined);
    },
    [enqueueFormSave],
  );

  /**
   * One-click AI generation: scan brand website (server) + LLM profile,
   * fill the page form, and save so agents can use it immediately.
   */
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      await waitForIdle();
      const service = await getBrandsService();
      const websiteFromLinks = brand.links?.find(
        (link) =>
          link.category === LinkCategory.WEBSITE ||
          link.category === LinkCategory.OTHER,
      )?.url;
      const websiteCandidate =
        websiteFromLinks ||
        (typeof (brand as { website?: string }).website === 'string'
          ? (brand as { website?: string }).website
          : undefined);
      const website =
        typeof websiteCandidate === 'string' ? websiteCandidate.trim() : '';
      const profile = await service.generateBrandVoice(brandId, {
        brandId,
        ...(website ? { url: website } : {}),
      });
      const nextForm = applyGeneratedProfileToForm(
        formRef.current,
        profile,
        brand.label,
      );
      formRef.current = nextForm;
      setForm(nextForm);
      await service.updateAgentConfig(
        brandId,
        buildAgentConfigPayload(nextForm),
      );
      await refreshBrands();
      await onRefreshBrand();
      notifications.success('Brand voice generated and saved');
    } catch (error) {
      logger.error('Failed to generate brand voice', error);
      notifications.error('Failed to generate brand voice');
    } finally {
      setIsGenerating(false);
    }
  }, [
    brand,
    brandId,
    getBrandsService,
    notifications,
    onRefreshBrand,
    refreshBrands,
    waitForIdle,
  ]);

  return {
    AUTO_MODEL_SELECT_VALUE,
    enabledModelIds,
    form,
    handleCanonicalSourceChange,
    handleDefaultModelChange,
    handleFieldSave,
    handleGenerate,
    handlePlatformOverrideSave,
    handlePlatformOverrideSelectChange,
    isGenerating,
    PLATFORM_OPTIONS,
    populatedPlatformCount,
  };
}

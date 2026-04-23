import type { AgentStrategy } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type {
  Brand,
  BrandAgentAutoPublish,
  BrandAgentConfig,
  BrandAgentPlatformOverride,
  BrandAgentSchedule,
  BrandAgentStrategy,
  BrandAgentVoice,
} from '@api/collections/brands/schemas/brand.schema';
import type { OrganizationSetting } from '@api/collections/organization-settings/schemas/organization-setting.schema';
import type {
  AgentGenerationPriority,
  AgentQualityTier,
  ResolvedAgentExecutionPolicy,
} from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import type { DefaultVoiceRef } from '@api/shared/default-voice-ref/default-voice-ref.schema';
import { AgentAutonomyMode } from '@genfeedai/enums';

type BrandSource = Pick<Brand, 'agentConfig'> | null | undefined;
type AgentStrategySource =
  | Pick<
      AgentStrategy,
      'autonomyMode' | 'brand' | 'model' | 'platforms' | 'qualityTier'
    >
  | null
  | undefined;
type OrganizationSettingsSource =
  | Pick<
      OrganizationSetting,
      | 'agentPolicy'
      | 'defaultAvatarIngredientId'
      | 'defaultAvatarPhotoUrl'
      | 'defaultModel'
      | 'defaultVoiceId'
      | 'defaultVoiceRef'
    >
  | null
  | undefined;

type PlatformOverride = Pick<
  BrandAgentPlatformOverride,
  'defaultModel' | 'persona' | 'strategy' | 'voice'
>;

export interface AgentIdentityDefaults {
  defaultAvatarIngredientId?: string;
  defaultAvatarPhotoUrl?: string;
  defaultVoiceId?: string;
  defaultVoiceRef?: DefaultVoiceRef;
}

export interface EffectiveBrandAgentConfig {
  autoPublish?: BrandAgentAutoPublish;
  defaultModel?: string;
  identityDefaults: {
    brand: AgentIdentityDefaults;
    organization: AgentIdentityDefaults;
  };
  persona?: string;
  platformOverrideApplied: boolean;
  schedule?: BrandAgentSchedule;
  strategy?: Partial<BrandAgentStrategy>;
  voice?: Partial<BrandAgentVoice>;
}

export interface EffectiveAgentExecutionConfig {
  policy: ResolvedAgentExecutionPolicy;
  strategyModel?: string;
}

export interface EffectiveAgentRuntimeConfig {
  brand: EffectiveBrandAgentConfig;
  execution: EffectiveAgentExecutionConfig;
}

const AGENT_QUALITY_TIERS: AgentQualityTier[] = [
  'budget',
  'balanced',
  'high_quality',
];

const mapQualityTierToGenerationPriority = (
  qualityTier: AgentQualityTier,
): AgentGenerationPriority => {
  switch (qualityTier) {
    case 'budget':
      return 'cost';
    case 'high_quality':
      return 'quality';
    default:
      return 'balanced';
  }
};

const resolvePlatformOverride = (
  platformOverrides: BrandAgentConfig['platformOverrides'] | unknown,
  platform?: string,
): PlatformOverride | undefined => {
  if (!platform || !platformOverrides) {
    return undefined;
  }

  if (platformOverrides instanceof Map) {
    return platformOverrides.get(platform) as PlatformOverride | undefined;
  }

  if (typeof platformOverrides === 'object') {
    return (platformOverrides as Record<string, unknown>)[platform] as
      | PlatformOverride
      | undefined;
  }

  return undefined;
};

const resolveIdentityDefaults = (
  source:
    | Pick<
        BrandAgentConfig,
        | 'defaultAvatarIngredientId'
        | 'defaultAvatarPhotoUrl'
        | 'defaultVoiceId'
        | 'defaultVoiceRef'
      >
    | OrganizationSettingsSource,
): AgentIdentityDefaults => ({
  defaultAvatarIngredientId: asOptionalString(
    source?.defaultAvatarIngredientId,
  ),
  defaultAvatarPhotoUrl: asOptionalString(source?.defaultAvatarPhotoUrl),
  defaultVoiceId: asOptionalString(source?.defaultVoiceId),
  defaultVoiceRef:
    source?.defaultVoiceRef &&
    typeof source.defaultVoiceRef === 'object' &&
    !Array.isArray(source.defaultVoiceRef)
      ? (source.defaultVoiceRef as DefaultVoiceRef)
      : undefined,
});

const normalizeAutonomyMode = (value: unknown): AgentAutonomyMode =>
  Object.values(AgentAutonomyMode).find((mode) => mode === value) ??
  AgentAutonomyMode.SUPERVISED;

const normalizeQualityTier = (value: unknown): AgentQualityTier =>
  AGENT_QUALITY_TIERS.find((tier) => tier === value) ?? 'balanced';

const firstPlatform = (value: unknown): string | undefined =>
  Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asBrandAgentConfig = (value: unknown): BrandAgentConfig | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as BrandAgentConfig;
};

export const resolveEffectiveBrandAgentConfig = ({
  brand,
  organizationSettings,
  platform,
}: {
  brand: BrandSource;
  organizationSettings?: OrganizationSettingsSource;
  platform?: string;
}): EffectiveBrandAgentConfig => {
  const brandAgentConfig = asBrandAgentConfig(brand?.agentConfig);
  const platformOverride = resolvePlatformOverride(
    brandAgentConfig?.platformOverrides,
    platform,
  );
  const hasVoiceConfig =
    brandAgentConfig?.voice != null || platformOverride?.voice != null;
  const hasStrategyConfig =
    brandAgentConfig?.strategy != null || platformOverride?.strategy != null;

  return {
    autoPublish: brandAgentConfig?.autoPublish,
    defaultModel:
      asOptionalString(platformOverride?.defaultModel) ??
      asOptionalString(brandAgentConfig?.defaultModel) ??
      asOptionalString(organizationSettings?.defaultModel),
    identityDefaults: {
      brand: resolveIdentityDefaults(brandAgentConfig),
      organization: resolveIdentityDefaults(organizationSettings),
    },
    persona:
      asOptionalString(platformOverride?.persona) ??
      asOptionalString(brandAgentConfig?.persona),
    platformOverrideApplied: platformOverride != null,
    schedule: brandAgentConfig?.schedule,
    strategy: hasStrategyConfig
      ? {
          ...(brandAgentConfig?.strategy ?? {}),
          ...(platformOverride?.strategy ?? {}),
        }
      : undefined,
    voice: hasVoiceConfig
      ? {
          ...(brandAgentConfig?.voice ?? {}),
          ...(platformOverride?.voice ?? {}),
        }
      : undefined,
  };
};

export const resolveEffectiveAgentExecutionConfig = ({
  organizationSettings,
  strategy,
}: {
  organizationSettings?: OrganizationSettingsSource;
  strategy?: AgentStrategySource;
}): EffectiveAgentExecutionConfig => {
  const qualityTier = normalizeQualityTier(
    strategy?.qualityTier ??
      organizationSettings?.agentPolicy?.qualityTierDefault,
  );

  return {
    policy: {
      allowAdvancedOverrides:
        organizationSettings?.agentPolicy?.allowAdvancedOverrides ?? false,
      autonomyMode: normalizeAutonomyMode(
        strategy?.autonomyMode ??
          organizationSettings?.agentPolicy?.autonomyDefault,
      ),
      brandId: asOptionalString(strategy?.brand),
      creditGovernance: {
        agentDailyCreditCap:
          organizationSettings?.agentPolicy?.creditGovernance
            ?.agentDailyCreditCap ?? null,
        brandDailyCreditCap:
          organizationSettings?.agentPolicy?.creditGovernance
            ?.brandDailyCreditCap ?? null,
        useOrganizationPool:
          organizationSettings?.agentPolicy?.creditGovernance
            ?.useOrganizationPool ?? true,
      },
      generationModelOverride:
        organizationSettings?.agentPolicy?.generationModelOverride ?? null,
      generationPriority: mapQualityTierToGenerationPriority(qualityTier),
      platform: firstPlatform(strategy?.platforms),
      qualityTier,
      reviewModelOverride:
        organizationSettings?.agentPolicy?.reviewModelOverride ?? null,
      thinkingModelOverride:
        organizationSettings?.agentPolicy?.thinkingModelOverride ?? null,
    },
    strategyModel: asOptionalString(strategy?.model),
  };
};

export const resolveEffectiveAgentRuntimeConfig = ({
  brand,
  organizationSettings,
  platform,
  strategy,
}: {
  brand: BrandSource;
  organizationSettings?: OrganizationSettingsSource;
  platform?: string;
  strategy?: AgentStrategySource;
}): EffectiveAgentRuntimeConfig => ({
  brand: resolveEffectiveBrandAgentConfig({
    brand,
    organizationSettings,
    platform,
  }),
  execution: resolveEffectiveAgentExecutionConfig({
    organizationSettings,
    strategy,
  }),
});

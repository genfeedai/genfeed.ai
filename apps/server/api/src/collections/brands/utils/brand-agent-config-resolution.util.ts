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
  defaultAvatarIngredientId: source?.defaultAvatarIngredientId,
  defaultAvatarPhotoUrl: source?.defaultAvatarPhotoUrl,
  defaultVoiceId: source?.defaultVoiceId,
  defaultVoiceRef: source?.defaultVoiceRef,
});

export const resolveEffectiveBrandAgentConfig = ({
  brand,
  organizationSettings,
  platform,
}: {
  brand: BrandSource;
  organizationSettings?: OrganizationSettingsSource;
  platform?: string;
}): EffectiveBrandAgentConfig => {
  const platformOverride = resolvePlatformOverride(
    brand?.agentConfig?.platformOverrides,
    platform,
  );
  const hasVoiceConfig =
    brand?.agentConfig?.voice != null || platformOverride?.voice != null;
  const hasStrategyConfig =
    brand?.agentConfig?.strategy != null || platformOverride?.strategy != null;

  return {
    autoPublish: brand?.agentConfig?.autoPublish,
    defaultModel:
      platformOverride?.defaultModel ??
      brand?.agentConfig?.defaultModel ??
      organizationSettings?.defaultModel,
    identityDefaults: {
      brand: resolveIdentityDefaults(brand?.agentConfig),
      organization: resolveIdentityDefaults(organizationSettings),
    },
    persona: platformOverride?.persona ?? brand?.agentConfig?.persona,
    platformOverrideApplied: platformOverride != null,
    schedule: brand?.agentConfig?.schedule,
    strategy: hasStrategyConfig
      ? {
          ...(brand?.agentConfig?.strategy ?? {}),
          ...(platformOverride?.strategy ?? {}),
        }
      : undefined,
    voice: hasVoiceConfig
      ? {
          ...(brand?.agentConfig?.voice ?? {}),
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
  const qualityTier =
    strategy?.qualityTier ??
    organizationSettings?.agentPolicy?.qualityTierDefault ??
    'balanced';

  return {
    policy: {
      allowAdvancedOverrides:
        organizationSettings?.agentPolicy?.allowAdvancedOverrides ?? false,
      autonomyMode:
        strategy?.autonomyMode ??
        organizationSettings?.agentPolicy?.autonomyDefault ??
        AgentAutonomyMode.SUPERVISED,
      brandId: strategy?.brand?.toString?.(),
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
      platform: strategy?.platforms?.[0],
      qualityTier,
      reviewModelOverride:
        organizationSettings?.agentPolicy?.reviewModelOverride ?? null,
      thinkingModelOverride:
        organizationSettings?.agentPolicy?.thinkingModelOverride ?? null,
    },
    strategyModel: strategy?.model,
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

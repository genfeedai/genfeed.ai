import type {
  Brand,
  BrandAgentConfig,
  BrandAgentPlatformOverride,
} from '@api/collections/brands/schemas/brand.schema';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type {
  ContentHarnessBrief,
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessIntent,
  HarnessPersonaProfile,
  HarnessSourceRecord,
  HarnessVoiceProfile,
} from '@genfeedai/harness';

type BrandSource = Pick<
  Brand,
  | '_id'
  | 'agentConfig'
  | 'description'
  | 'label'
  | 'primaryColor'
  | 'secondaryColor'
  | 'text'
>;

type PersonaSource = Pick<
  {
    bio?: string | null;
    contentStrategy?: {
      formats?: string[];
      platforms?: string[];
      topics?: string[];
    } | null;
    darkroomSources?: Array<{ platform?: string | null }> | null;
    handle?: string | null;
    label: string;
  },
  'bio' | 'contentStrategy' | 'darkroomSources' | 'handle' | 'label'
>;

const MAX_BRIEF_SOURCE_LENGTH = 240;
const MAX_PROMPT_SOURCES = 5;

const trimLine = (
  value: string,
  maxLength = MAX_BRIEF_SOURCE_LENGTH,
): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );

  return items.length > 0 ? items : undefined;
};

const getDarkroomPlatforms = (
  sources: PersonaSource['darkroomSources'],
): string[] | undefined => {
  if (!Array.isArray(sources)) {
    return undefined;
  }

  const platforms = sources
    .map((source) => toOptionalString(source?.platform))
    .filter((platform): platform is string => Boolean(platform));

  return platforms.length > 0 ? platforms : undefined;
};

const resolvePlatformOverride = (
  brand: BrandSource,
  platform?: string,
): Pick<
  BrandAgentPlatformOverride,
  'defaultModel' | 'persona' | 'strategy' | 'voice'
> | null => {
  if (!platform) {
    return null;
  }

  const agentConfig =
    brand.agentConfig &&
    typeof brand.agentConfig === 'object' &&
    !Array.isArray(brand.agentConfig)
      ? (brand.agentConfig as BrandAgentConfig)
      : undefined;
  const overrides = agentConfig?.platformOverrides;
  if (!overrides) {
    return null;
  }

  if (overrides instanceof Map) {
    return overrides.get(platform) ?? null;
  }

  if (typeof overrides === 'object') {
    return (
      (
        overrides as Record<
          string,
          Pick<
            BrandAgentPlatformOverride,
            'defaultModel' | 'persona' | 'strategy' | 'voice'
          >
        >
      )[platform] ?? null
    );
  }

  return null;
};

export const buildHarnessVoiceProfile = (
  brand: BrandSource,
  platform?: string,
): HarnessVoiceProfile | undefined => {
  const effectiveConfig = resolveEffectiveBrandAgentConfig({
    brand,
    platform,
  });
  const voice = effectiveConfig.voice;

  if (!voice) {
    return undefined;
  }

  return {
    audience: voice.audience,
    doNotSoundLike: voice.doNotSoundLike,
    hashtags: voice.hashtags,
    messagingPillars: voice.messagingPillars,
    sampleOutput: voice.sampleOutput,
    style: voice.style,
    taglines: voice.taglines,
    tone: voice.tone,
    values: voice.values,
  };
};

export const buildHarnessPersonaProfile = (
  persona?: PersonaSource | null,
): HarnessPersonaProfile | undefined => {
  if (!persona) {
    return undefined;
  }

  const contentStrategy = persona.contentStrategy;

  return {
    bio: toOptionalString(persona.bio),
    formats: toStringArray(contentStrategy?.formats),
    label: persona.label,
    platforms:
      toStringArray(contentStrategy?.platforms) ??
      getDarkroomPlatforms(persona.darkroomSources),
    topics: toStringArray(contentStrategy?.topics),
    voice: toOptionalString(persona.handle),
  };
};

export const buildHarnessInput = (params: {
  additionalSources?: HarnessSourceRecord[];
  brand?: BrandSource | null;
  intent: ContentHarnessIntent;
  organizationId: string;
  persona?: PersonaSource | null;
  profileContribution?: ContentHarnessContribution;
}): ContentHarnessInput => {
  const voiceProfile = params.brand
    ? buildHarnessVoiceProfile(params.brand, params.intent.platform)
    : undefined;
  const personaProfile = buildHarnessPersonaProfile(params.persona);

  return {
    brandId: params.brand?._id?.toString?.(),
    brandName: toOptionalString(params.brand?.label),
    intent: params.intent,
    organizationId: params.organizationId,
    personaProfile,
    profileContribution: params.profileContribution,
    sources: params.additionalSources,
    voiceProfile,
  };
};

export const buildPromptBuilderBrandContext = (params: {
  brand?: BrandSource | null;
  intent?: Pick<ContentHarnessIntent, 'platform'>;
  persona?: PersonaSource | null;
}): Pick<
  PromptBuilderParams,
  'brand' | 'branding' | 'brandingMode' | 'isBrandingEnabled'
> => {
  const brand = params.brand;
  if (!brand) {
    return {};
  }

  const voiceProfile = buildHarnessVoiceProfile(brand, params.intent?.platform);
  const personaProfile = buildHarnessPersonaProfile(params.persona);
  const platformOverride = resolvePlatformOverride(
    brand,
    params.intent?.platform,
  );
  const personaVoice = [
    personaProfile?.label,
    platformOverride?.persona,
    personaProfile?.voice,
    personaProfile?.bio,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' | ');

  return {
    brand: {
      description: toOptionalString(brand.description),
      label: brand.label ?? '',
      primaryColor: toOptionalString(brand.primaryColor),
      secondaryColor: toOptionalString(brand.secondaryColor),
      text: toOptionalString(brand.text),
    },
    branding: {
      audience: voiceProfile?.audience?.join(', '),
      doNotSoundLike: voiceProfile?.doNotSoundLike,
      hashtags: voiceProfile?.hashtags,
      messagingPillars: voiceProfile?.messagingPillars,
      sampleOutput: voiceProfile?.sampleOutput,
      taglines: voiceProfile?.taglines,
      tone: voiceProfile?.tone,
      values: voiceProfile?.values,
      voice: personaVoice || voiceProfile?.style,
    },
    brandingMode: 'brand',
    isBrandingEnabled: true,
  };
};

export const formatHarnessBrief = (
  brief: ContentHarnessBrief | null | undefined,
): string => {
  if (!brief) {
    return '';
  }

  const sections: string[] = [];

  if (brief.systemDirectives.length > 0) {
    sections.push(
      `SYSTEM DIRECTIVES:\n${brief.systemDirectives.map((line) => `- ${line}`).join('\n')}`,
    );
  }

  if (brief.styleDirectives.length > 0) {
    sections.push(
      `STYLE DIRECTIVES:\n${brief.styleDirectives.map((line) => `- ${line}`).join('\n')}`,
    );
  }

  if (brief.guardrails.length > 0) {
    sections.push(
      `GUARDRAILS:\n${brief.guardrails.map((line) => `- ${line}`).join('\n')}`,
    );
  }

  if (brief.evaluationCriteria.length > 0) {
    sections.push(
      `EVALUATION CRITERIA:\n${brief.evaluationCriteria.map((line) => `- ${line}`).join('\n')}`,
    );
  }

  if (brief.sources.length > 0) {
    sections.push(
      `REFERENCE SIGNALS:\n${brief.sources
        .slice(0, MAX_PROMPT_SOURCES)
        .map(
          (source) =>
            `- [${source.kind}] ${trimLine(source.content)}${source.source ? ` (source: ${source.source})` : ''}`,
        )
        .join('\n')}`,
    );
  }

  return sections.join('\n\n');
};

export const appendHarnessBriefToPrompt = (
  prompt: string,
  brief: ContentHarnessBrief | null | undefined,
): string => {
  const formattedBrief = formatHarnessBrief(brief);
  if (!formattedBrief) {
    return prompt;
  }

  return `${prompt}\n\nCONTENT HARNESS:\n${formattedBrief}`;
};

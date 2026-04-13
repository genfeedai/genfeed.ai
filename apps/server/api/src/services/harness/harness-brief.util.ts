import type {
  Brand,
  BrandAgentPlatformOverride,
} from '@api/collections/brands/schemas/brand.schema';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import type { Persona } from '@api/collections/personas/schemas/persona.schema';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type {
  ContentHarnessBrief,
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
  Persona,
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

  const overrides = brand.agentConfig?.platformOverrides;
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

  return {
    bio: persona.bio,
    formats: persona.contentStrategy?.formats?.map(String),
    label: persona.label,
    platforms:
      persona.contentStrategy?.platforms ??
      persona.darkroomSources?.map((source) => source.platform),
    topics: persona.contentStrategy?.topics,
    voice: persona.handle,
  };
};

export const buildHarnessInput = (params: {
  additionalSources?: HarnessSourceRecord[];
  brand?: BrandSource | null;
  intent: ContentHarnessIntent;
  organizationId: string;
  persona?: PersonaSource | null;
}): ContentHarnessInput => {
  const voiceProfile = params.brand
    ? buildHarnessVoiceProfile(params.brand, params.intent.platform)
    : undefined;
  const personaProfile = buildHarnessPersonaProfile(params.persona);

  return {
    brandId: params.brand?._id?.toString?.(),
    brandName: params.brand?.label,
    intent: params.intent,
    organizationId: params.organizationId,
    personaProfile,
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
      description: brand.description,
      label: brand.label,
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      text: brand.text,
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

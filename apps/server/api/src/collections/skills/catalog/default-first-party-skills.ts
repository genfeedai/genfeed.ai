import { AgentType } from '@genfeedai/enums';

export type DefaultFirstPartySkillContext = {
  agentType?: string;
  channel?: string;
  modality?: string;
};

const MAX_DEFAULT_SKILLS = 4;

const AGENT_TYPE_DEFAULTS: Record<string, readonly string[]> = {
  [AgentType.ADS_SCRIPT_WRITER]: ['ad-copy-creator'],
  [AgentType.ARTICLE_WRITER]: ['blog-content-creator'],
  [AgentType.IMAGE_CREATOR]: ['image-prompt-engineer', 'model-selector'],
  [AgentType.LINKEDIN_CONTENT]: ['linkedin-content-creator'],
  [AgentType.SHORT_FORM_WRITER]: ['instagram-content-creator'],
  [AgentType.VIDEO_CREATOR]: ['model-selector', 'image-prompt-engineer'],
  [AgentType.X_CONTENT]: ['x-content-creator'],
  [AgentType.YOUTUBE_SCRIPT]: ['youtube-content-creator'],
};

const CHANNEL_DEFAULTS: Record<string, readonly string[]> = {
  ads: ['ad-copy-creator'],
  blog: ['blog-content-creator'],
  instagram: ['instagram-content-creator'],
  linkedin: ['linkedin-content-creator'],
  reels: ['instagram-content-creator'],
  tiktok: ['tiktok-warmup'],
  twitter: ['x-content-creator'],
  x: ['x-content-creator'],
  youtube: ['youtube-content-creator'],
};

const MODALITY_DEFAULTS: Record<string, readonly string[]> = {
  audio: ['model-selector'],
  image: ['image-prompt-engineer', 'model-selector'],
  video: ['model-selector', 'image-prompt-engineer'],
};

const GENERIC_DEFAULTS = ['content-writing'] as const;

function addUnique(target: string[], slugs: readonly string[]): void {
  for (const slug of slugs) {
    if (!target.includes(slug)) {
      target.push(slug);
    }
  }
}

/**
 * Small first-party default set for a turn whose brand has empty `enabledSkills`.
 * Packs by agent type, then modality, then channel — never the full catalog.
 */
export function resolveDefaultFirstPartySkillSlugs(
  context: DefaultFirstPartySkillContext = {},
): string[] {
  const slugs: string[] = [];

  if (context.agentType) {
    addUnique(slugs, AGENT_TYPE_DEFAULTS[context.agentType] ?? []);
  }

  if (context.modality) {
    addUnique(slugs, MODALITY_DEFAULTS[context.modality] ?? []);
  }

  const channel = context.channel?.toLowerCase();
  if (channel) {
    addUnique(slugs, CHANNEL_DEFAULTS[channel] ?? []);
  }

  if (slugs.length === 0) {
    addUnique(slugs, GENERIC_DEFAULTS);
  }

  return slugs.slice(0, MAX_DEFAULT_SKILLS);
}

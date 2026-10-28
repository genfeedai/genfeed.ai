import { AgentType } from '@genfeedai/contracts';

export type DefaultFirstPartySkillContext = {
  agentType?: string;
  channel?: string;
  modality?: string;
};

const MAX_DEFAULT_SKILLS = 4;

const AGENT_TYPE_DEFAULTS: Record<string, readonly string[]> = {
  [AgentType.ADS_SCRIPT_WRITER]: ['ad-copy-creator'],
  [AgentType.AI_AVATAR]: ['clip-editor'],
  [AgentType.ARTICLE_WRITER]: ['blog-content-creator'],
  [AgentType.IMAGE_CREATOR]: ['image-prompt-engineer', 'model-selector'],
  [AgentType.LINKEDIN_CONTENT]: ['linkedin-content-creator'],
  [AgentType.SHORT_FORM_WRITER]: ['instagram-content-creator'],
  [AgentType.VIDEO_CREATOR]: [
    'model-selector',
    'image-prompt-engineer',
    'clip-editor',
  ],
  [AgentType.X_CONTENT]: ['x-content-creator'],
  [AgentType.YOUTUBE_SCRIPT]: ['youtube-content-creator'],
};

const CHANNEL_DEFAULTS: Record<string, readonly string[]> = {
  ads: ['ad-copy-creator'],
  blog: ['blog-content-creator'],
};

/**
 * Channels whose platform guidance comes from a built-in harness platform
 * pack (`@genfeedai/harness` `platform-*`). A default turn on one of these
 * channels injects no skill text: the pack already carries the platform rules
 * in short form, and pasting the full product skill would duplicate them.
 */
const HARNESS_PLATFORM_CHANNELS = new Set([
  'instagram',
  'linkedin',
  'reels',
  'shorts',
  'tiktok',
  'twitter',
  'x',
  'youtube',
]);

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

function collectDefaultSlugs(): string[] {
  const slugs: string[] = [];
  addUnique(slugs, GENERIC_DEFAULTS);
  for (const group of [
    AGENT_TYPE_DEFAULTS,
    MODALITY_DEFAULTS,
    CHANNEL_DEFAULTS,
  ]) {
    for (const values of Object.values(group)) {
      addUnique(slugs, values);
    }
  }
  return slugs;
}

/**
 * Every first-party slug that can be injected while a brand has no explicit
 * `enabledSkills`. This is what the settings catalog reports as enabled by
 * default; a turn still packs the context-relevant subset from it.
 */
export const DEFAULT_FIRST_PARTY_SKILL_SLUGS: readonly string[] =
  collectDefaultSlugs();

export function isDefaultFirstPartySkillSlug(slug: unknown): boolean {
  return (
    typeof slug === 'string' && DEFAULT_FIRST_PARTY_SKILL_SLUGS.includes(slug)
  );
}

/**
 * Small first-party default set for a turn whose brand has empty `enabledSkills`.
 * Packs by agent type, then modality, then channel — never the full catalog.
 * A channel served by a harness platform pack adds nothing on its own.
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

  if (
    slugs.length === 0 &&
    !(channel && HARNESS_PLATFORM_CHANNELS.has(channel))
  ) {
    addUnique(slugs, GENERIC_DEFAULTS);
  }

  return slugs.slice(0, MAX_DEFAULT_SKILLS);
}

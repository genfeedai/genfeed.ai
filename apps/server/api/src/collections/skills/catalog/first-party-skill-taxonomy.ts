import {
  SKILL_CHANNELS,
  SKILL_MODALITIES,
  SKILL_WORKFLOW_STAGES,
} from '@api/collections/skills/schemas/skill.schema';
import { ContentSkillCategory } from '@genfeedai/enums';

import type { FirstPartySkillMetadata } from './first-party-skill.types';

type SkillChannel = (typeof SKILL_CHANNELS)[number];
type SkillModality = (typeof SKILL_MODALITIES)[number];
type SkillWorkflowStage = (typeof SKILL_WORKFLOW_STAGES)[number];

export type FirstPartySkillTaxonomy = {
  category: ContentSkillCategory;
  channels: SkillChannel[];
  modalities: SkillModality[];
  workflowStage: SkillWorkflowStage;
};

const CHANNEL_ALIASES: Record<string, SkillChannel> = {
  ad: 'ads',
  ads: 'ads',
  blog: 'blog',
  ig: 'instagram',
  instagram: 'instagram',
  linkedin: 'linkedin',
  newsletter: 'blog',
  reels: 'reels',
  tiktok: 'tiktok',
  twitter: 'x',
  x: 'x',
  youtube: 'youtube',
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function slugTokens(slug: string): string[] {
  return slug.toLowerCase().split('-').filter(Boolean);
}

function inferChannels(slug: string, tags: string[]): SkillChannel[] {
  const channels: SkillChannel[] = [];

  for (const token of [...slugTokens(slug), ...tags]) {
    const channel = CHANNEL_ALIASES[token];
    if (channel) {
      channels.push(channel);
    }
  }

  return unique(channels);
}

function inferModalities(
  slug: string,
  metadata: FirstPartySkillMetadata,
): SkillModality[] {
  // metadata.outputs is the skill artifact (often "text"/"json"), not the
  // generation modality the agent should pack this skill against.
  const mediaOutputs = (metadata.outputs ?? []).filter(
    (output): output is 'audio' | 'image' | 'video' =>
      output === 'audio' || output === 'image' || output === 'video',
  );
  const haystack = [slug, ...(metadata.tags ?? []), ...mediaOutputs]
    .join(' ')
    .toLowerCase();

  const modalities: SkillModality[] = [];

  if (
    haystack.includes('image') ||
    haystack.includes('visual') ||
    haystack.includes('prompt')
  ) {
    modalities.push('image');
  }

  if (haystack.includes('video')) {
    modalities.push('video');
  }

  if (haystack.includes('audio') || haystack.includes('voice')) {
    modalities.push('audio');
  }

  if (
    haystack.includes('copy') ||
    haystack.includes('writing') ||
    haystack.includes('caption') ||
    haystack.includes('tweet') ||
    haystack.includes('thread') ||
    haystack.includes('newsletter') ||
    haystack.includes('blog') ||
    haystack.includes('content-creation') ||
    haystack.includes('creator')
  ) {
    modalities.push('text');
  }

  if (modalities.length === 0) {
    return ['text'];
  }

  if (modalities.length > 1) {
    return unique(['multi', ...modalities]);
  }

  return unique(modalities);
}

function inferWorkflowStage(slug: string): SkillWorkflowStage {
  if (slug.includes('warmup')) {
    return 'publishing';
  }

  if (
    slug.includes('reviewer') ||
    slug.includes('optimizer') ||
    slug.includes('seo') ||
    slug.includes('geo')
  ) {
    return 'review';
  }

  if (
    slug.includes('analyzer') ||
    slug.includes('performance') ||
    slug.includes('scope-validator')
  ) {
    return 'analysis';
  }

  if (
    slug.includes('strategist') ||
    slug.includes('competitor') ||
    slug.includes('discovery')
  ) {
    return 'research';
  }

  if (
    slug.includes('onboarding') ||
    slug.includes('brand-os') ||
    slug.includes('visual-brand') ||
    slug.includes('workflow') ||
    slug.includes('node-creator')
  ) {
    return 'planning';
  }

  return 'creation';
}

function inferCategory(
  slug: string,
  modalities: SkillModality[],
): ContentSkillCategory {
  if (slug.includes('warmup') || slug.includes('openclaw')) {
    return ContentSkillCategory.DISTRIBUTION;
  }

  if (
    slug.includes('analyzer') ||
    slug.includes('performance') ||
    slug.includes('reviewer')
  ) {
    return ContentSkillCategory.ANALYTICS;
  }

  if (
    slug.includes('optimizer') ||
    slug.includes('seo') ||
    slug.includes('geo')
  ) {
    return ContentSkillCategory.OPTIMIZATION;
  }

  if (
    slug.includes('strategist') ||
    slug.includes('competitor') ||
    slug.includes('discovery')
  ) {
    return ContentSkillCategory.DISCOVERY;
  }

  if (modalities.includes('image') && !modalities.includes('text')) {
    return ContentSkillCategory.IMAGE;
  }

  if (modalities.includes('video') && !modalities.includes('text')) {
    return ContentSkillCategory.VIDEO;
  }

  if (modalities.includes('audio') && !modalities.includes('text')) {
    return ContentSkillCategory.AUDIO;
  }

  return ContentSkillCategory.WRITING;
}

export function inferFirstPartySkillTaxonomy(
  slug: string,
  metadata: FirstPartySkillMetadata = {},
): FirstPartySkillTaxonomy {
  const channels = inferChannels(slug, metadata.tags ?? []);
  const modalities = inferModalities(slug, metadata);
  const workflowStage = inferWorkflowStage(slug);
  const category = inferCategory(slug, modalities);

  return {
    category,
    channels,
    modalities,
    workflowStage,
  };
}

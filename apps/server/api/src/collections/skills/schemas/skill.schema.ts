import type { Skill } from '@genfeedai/prisma';

export type { Skill } from '@genfeedai/prisma';

export const SKILL_MODALITIES = [
  'text',
  'image',
  'video',
  'audio',
  'multi',
] as const;

export const SKILL_CHANNELS = [
  'tiktok',
  'reels',
  'instagram',
  'youtube',
  'x',
  'linkedin',
  'blog',
  'ads',
] as const;

export const SKILL_WORKFLOW_STAGES = [
  'research',
  'planning',
  'creation',
  'review',
  'publishing',
  'analysis',
] as const;

export const SKILL_SOURCES = [
  'built_in',
  'imported',
  'custom',
  'customized',
] as const;
export const SKILL_STATUSES = ['draft', 'published', 'disabled'] as const;

export interface SkillDocument extends Skill {
  channels?: string[];
  /** Built-in slug the runtime injects while a brand has no explicit selection. */
  isDefault?: boolean;
  modalities?: string[];
  name?: string;
  requiredProviders?: string[];
  reviewDefaults?: Record<string, unknown>;
  slug?: string;
  sourceListingId?: string;
  version?: string;
  workflowStage?: string;
  [key: string]: unknown;
}

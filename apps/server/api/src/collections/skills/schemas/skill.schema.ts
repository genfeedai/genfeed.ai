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

export const SKILL_SOURCES = ['built_in', 'imported', 'custom'] as const;
export const SKILL_STATUSES = ['draft', 'published', 'disabled'] as const;

export interface SkillDocument extends Skill {
  _id: string;
  channels?: string[];
  modalities?: string[];
  name?: string;
  requiredProviders?: string[];
  reviewDefaults?: Record<string, unknown>;
  slug?: string;
  workflowStage?: string;
  [key: string]: unknown;
}

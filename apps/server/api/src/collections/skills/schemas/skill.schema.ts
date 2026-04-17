export type {
  Skill,
  Skill as SkillDocument,
} from '@genfeedai/prisma';

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

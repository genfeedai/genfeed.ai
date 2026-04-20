export type {
  Project as ProjectDocument,
  Project,
} from '@genfeedai/prisma';

export const PROJECT_STATUSES = ['active', 'completed', 'archived'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

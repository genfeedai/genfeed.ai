export type ProjectDocument = Record<string, unknown>;

export const PROJECT_STATUSES = ['active', 'completed', 'archived'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

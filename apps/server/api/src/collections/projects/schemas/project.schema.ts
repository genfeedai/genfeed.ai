export type ProjectDocument = Record<string, unknown>;
export type Project = ProjectDocument;

export const PROJECT_STATUSES = ['active', 'completed', 'archived'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

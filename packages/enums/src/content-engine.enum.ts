export enum ContentPlanStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ContentPlanItemStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum ContentPlanItemType {
  SKILL = 'skill',
  MEDIA_PIPELINE = 'media_pipeline',
}

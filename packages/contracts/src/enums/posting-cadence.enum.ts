/**
 * Posting cadence and calendar-slot planning states.
 *
 * These are product-language String-column vocabularies, not Prisma enums.
 * Slot `skipped` is a reservation planning state and is distinct from
 * `TargetExecutionState.SKIPPED`.
 *
 * Foundation for epic #3247, child #3250.
 */

export enum PostingCadenceStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  ARCHIVED = 'archived',
}

export enum CadenceGenerateLanding {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
}

export enum CalendarSlotState {
  MISSING = 'missing',
  GENERATING = 'generating',
  GENERATE_FAILED = 'generate-failed',
  FILLED = 'filled',
  SKIPPED = 'skipped',
}

export enum CalendarSlotItemType {
  POST = 'post',
  RELEASE = 'release',
  ARTICLE = 'article',
}

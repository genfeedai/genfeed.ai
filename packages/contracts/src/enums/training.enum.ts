export enum TrainingCategory {
  SUBJECT = 'subject',
  STYLE = 'style',
}

/** Training job status (string column / app state — not a Prisma enum). */
export enum TrainingStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum TrainingProvider {
  REPLICATE = 'replicate',
  GENFEED_AI = 'genfeed-ai',
}

/**
 * Training pipeline stage. Values match Prisma `TrainingStage` (SCREAMING_SNAKE).
 *
 * GPU job stages map into this set at the fleet boundary:
 * queued/preprocessing → PENDING, postprocessing → UPLOADING, completed → READY.
 *
 * @see packages/prisma/prisma/schema.prisma `enum TrainingStage`
 */
export enum TrainingStage {
  PENDING = 'PENDING',
  UPLOADING = 'UPLOADING',
  TRAINING = 'TRAINING',
  READY = 'READY',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

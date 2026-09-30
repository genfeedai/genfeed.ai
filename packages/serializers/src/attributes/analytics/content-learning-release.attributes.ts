import { createEntityAttributes } from '@genfeedai/helpers';
export const contentLearningReleaseAttributes = createEntityAttributes([
  'manifest',
  'reportId',
  'stage',
  'revision',
  'priorReleaseId',
  'synthetic',
  'invalidationRevision',
  'stageStartedAt',
  'activeCells',
]);

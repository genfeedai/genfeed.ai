import { createEntityAttributes } from '@genfeedai/helpers';
export const contentLearningOperationAttributes = createEntityAttributes([
  'type',
  'status',
  'beforeRevision',
  'afterRevision',
  'error',
  'resultReferences',
]);

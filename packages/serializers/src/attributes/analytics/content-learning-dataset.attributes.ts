import { createEntityAttributes } from '@genfeedai/helpers';
export const contentLearningDatasetAttributes = createEntityAttributes([
  'origin',
  'schemaVersion',
  'profile',
  'cell',
  'cutoff',
  'manifestHash',
  'status',
  'counts',
  'invalidationRevision',
  'synthetic',
]);

import { createEntityAttributes } from '@genfeedai/helpers';
export const contentLearningRunAttributes = createEntityAttributes([
  'datasetId',
  'configHash',
  'parentArtifactId',
  'baselineArtifactId',
  'type',
  'status',
  'progress',
  'error',
  'workflowExecutionId',
  'resultArtifactId',
  'report',
  'seed',
  'startedAt',
  'completedAt',
  'synthetic',
]);

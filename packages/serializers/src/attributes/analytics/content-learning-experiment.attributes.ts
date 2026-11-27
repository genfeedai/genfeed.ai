import { createEntityAttributes } from '@genfeedai/helpers';
// The encrypted seed and the preregistering operator never leave the server.
export const contentLearningExperimentAttributes = createEntityAttributes([
  'kind',
  'status',
  'cellKey',
  'candidatePolicyId',
  'builtInControlVersion',
  'spec',
  'specHash',
  'revision',
  'startAt',
  'endAt',
  'freezeAt',
  'sealedAt',
  'enrollment',
]);

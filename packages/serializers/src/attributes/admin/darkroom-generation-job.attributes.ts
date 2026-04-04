import { createEntityAttributes } from '@genfeedai/helpers';

export const darkroomGenerationJobAttributes = createEntityAttributes([
  'cdnUrl',
  'createdAt',
  'error',
  'ingredientId',
  'jobId',
  'model',
  'personaSlug',
  'progress',
  'prompt',
  'stage',
  'status',
  'updatedAt',
]);

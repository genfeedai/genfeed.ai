import { createEntityAttributes } from '@genfeedai/helpers';

export const contentPlanItemAttributes = createEntityAttributes([
  'organization',
  'plan',
  'brand',
  'status',
  'type',
  'topic',
  'prompt',
  'platforms',
  'scheduledAt',
  'skillSlug',
  'pipelineSteps',
  'confidence',
  'contentDraftId',
  'error',
]);

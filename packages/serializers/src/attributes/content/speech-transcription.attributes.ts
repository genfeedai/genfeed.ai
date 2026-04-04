import { createEntityAttributes } from '@genfeedai/helpers';

export const speechTranscriptionAttributes = createEntityAttributes([
  'text',
  'language',
  'duration',
  'confidence',
  'creditsUsed',
]);

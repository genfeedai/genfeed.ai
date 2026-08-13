import { createEntityAttributes } from '@genfeedai/helpers';

export const livestreamBotSessionAttributes = createEntityAttributes([
  'bot',
  'organizationId',
  'brandId',
  'userId',
  'status',
  'context',
  'transcriptChunks',
  'platformStates',
  'deliveryHistory',
  'startedAt',
  'pausedAt',
  'stoppedAt',
  'lastTranscriptAt',
]);

import { createEntityAttributes } from '@genfeedai/helpers';

export const livestreamBotSessionAttributes = createEntityAttributes([
  'bot',
  'organization',
  'brand',
  'user',
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

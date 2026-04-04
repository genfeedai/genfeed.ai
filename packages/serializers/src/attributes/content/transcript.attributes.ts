import { createEntityAttributes } from '@genfeedai/helpers';

export const transcriptAttributes = createEntityAttributes([
  'user',
  'organization',
  'article',
  'youtubeUrl',
  'youtubeId',
  'videoTitle',
  'videoDuration',
  'transcriptText',
  'language',
  'status',
  'error',
  'audioFileUrl',
]);

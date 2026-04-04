import { createEntityAttributes } from '@genfeedai/helpers';

export const clipProjectAttributes = createEntityAttributes([
  'user',
  'organization',
  'name',
  'sourceVideoUrl',
  'sourceVideoS3Key',
  'videoMetadata',
  'transcriptText',
  'transcriptSrt',
  'transcriptSegments',
  'language',
  'status',
  'progress',
  'settings',
  'error',
]);

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
  'referenceFrames',
  'language',
  'status',
  'progress',
  'settings',
  'error',
  'readiness',
  'readyClipCount',
  'failedClipCount',
  'pendingClipCount',
  'terminalAt',
]);

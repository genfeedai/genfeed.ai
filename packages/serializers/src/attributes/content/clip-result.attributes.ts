import { createEntityAttributes } from '@genfeedai/helpers';

export const clipResultAttributes = createEntityAttributes([
  'user',
  'organization',
  'project',
  'index',
  'title',
  'summary',
  'startTime',
  'endTime',
  'duration',
  'viralityScore',
  'tags',
  'clipType',
  'videoUrl',
  'videoS3Key',
  'captionedVideoUrl',
  'captionedVideoS3Key',
  'thumbnailUrl',
  'captionSrt',
  'status',
  'isSelected',
]);

import { createEntityAttributes } from '@genfeedai/helpers';

export const editorProjectAttributes = createEntityAttributes([
  'name',
  'organization',
  'brand',
  'user',
  'tracks',
  'settings',
  'totalDurationFrames',
  'status',
  'renderedVideo',
  'thumbnailUrl',
]);

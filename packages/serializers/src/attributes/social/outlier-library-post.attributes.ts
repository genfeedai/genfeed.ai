import { createEntityAttributes } from '@genfeedai/helpers';

/** Public numbers and links of another creator's post; nothing tenant-owned. */
export const outlierLibraryPostAttributes = createEntityAttributes([
  'platform',
  'externalId',
  'url',
  'publishedAt',
  'views',
  'likes',
  'comments',
  'countsReadAt',
  'medianViews',
  'sampleSize',
  'outlierRatio',
  'outlierTier',
  'soundId',
  'hashtags',
  'captionExcerpt',
  'format',
  'creator',
]);

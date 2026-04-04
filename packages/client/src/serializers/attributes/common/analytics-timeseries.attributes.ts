import { Platform } from '@genfeedai/enums';
import { createEntityAttributes } from '@genfeedai/helpers';

export const analyticsTimeSeriesAttributes = createEntityAttributes([
  'date',
  'views',
  'likes',
  'comments',
  'shares',
  'saves',
  'engagementRate',
  'totalEngagement',
]);

export const analyticsTimeSeriesWithPlatformsAttributes =
  createEntityAttributes([
    'date',
    Platform.INSTAGRAM,
    Platform.TIKTOK,
    Platform.YOUTUBE,
    Platform.FACEBOOK,
    Platform.TWITTER,
    Platform.LINKEDIN,
    Platform.REDDIT,
    Platform.PINTEREST,
    Platform.MEDIUM,
  ]);

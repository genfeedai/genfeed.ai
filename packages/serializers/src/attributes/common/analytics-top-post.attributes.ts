import { createEntityAttributes } from '@genfeedai/helpers';

/**
 * `GET /analytics/top` (AnalyticsController.getTopContent, consumed by
 * `useTopPosts`/`AnalyticsPostsList`). Distinct from
 * `analyticsTopContentAttributes`, which serializes the unrelated
 * organizations-relationships `top-content` endpoint's `TopContent` shape
 * (title/views/likes/comments/shares) — a different producer entirely.
 * `analyticsResponseProjection.buildTopContent` is this endpoint's real
 * producer and already emits exactly these field names; #5404 (found while
 * fixing #5381) is the two endpoints sharing one stale serializer, so the
 * client-facing route silently dropped brandName, the total-prefixed
 * metrics and label, and always rendered a fallback brand name with zeroed
 * metrics.
 */
export const analyticsTopPostAttributes = createEntityAttributes([
  'postId',
  'label',
  'description',
  'platform',
  'brandName',
  'brandLogo',
  'totalViews',
  'totalLikes',
  'totalComments',
  'totalShares',
  'totalSaves',
  'totalEngagement',
  'engagementRate',
  'thumbnailUrl',
  'ingredientUrl',
  'isVideo',
]);

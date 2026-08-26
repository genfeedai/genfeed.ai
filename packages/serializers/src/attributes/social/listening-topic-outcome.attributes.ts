import { createEntityAttributes } from '@genfeedai/helpers';

export const listeningTopicOutcomeAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'topicId',
  'themeId',
  'evidenceIds',
  'state',
  'actionId',
  'sourcePostId',
  'releaseId',
  'publicationId',
  'latestPostAnalyticsId',
  'scheduledAt',
  'publishedAt',
  'measuredAt',
]);

import { createEntityAttributes } from '@genfeedai/helpers';

export const botActivityAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'userId',
  'replyBotConfigId',
  'monitoredAccountId',
  'platform',
  'status',
  'triggerContentId',
  'triggerContentText',
  'triggerContentAuthor',
  'triggerContentUrl',
  'replyText',
  'replyContentId',
  'replyContentUrl',
  'dmText',
  'dmSent',
  'processingTimeMs',
  'errorMessage',
  'skippedReason',
  // Why a comment was skipped, not merely that it was (#4866).
  'intent',
  'intentConfidence',
  'intentSource',
  'isIntentNeedsReview',
  // The post a monitored-account reply answers, and the draft waiting for a
  // person to post it (awaiting_approval).
  'triggerTweetId',
  'triggerTweetText',
  'triggerTweetAuthorUsername',
  'draftReplyText',
]);

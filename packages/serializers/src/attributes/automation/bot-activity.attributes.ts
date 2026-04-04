import { createEntityAttributes } from '@genfeedai/helpers';

export const botActivityAttributes = createEntityAttributes([
  'organization',
  'replyBotConfig',
  'monitoredAccount',
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
]);

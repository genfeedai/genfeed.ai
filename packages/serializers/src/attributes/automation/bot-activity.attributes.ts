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
]);

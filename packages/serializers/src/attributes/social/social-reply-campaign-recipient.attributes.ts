import { createEntityAttributes } from '@genfeedai/helpers';

export const socialReplyCampaignRecipientAttributes = createEntityAttributes([
  'campaignId',
  'organizationId',
  'conversationId',
  'messageId',
  'status',
  'position',
  'scheduledAt',
  'dispatchedAt',
  'sentAt',
  'attemptCount',
  'idempotencyKey',
  'body',
  'failureReason',
  'metadata',
]);

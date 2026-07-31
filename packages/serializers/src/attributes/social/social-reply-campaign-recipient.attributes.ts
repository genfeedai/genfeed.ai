import { createEntityAttributes } from '@genfeedai/helpers';

export const socialReplyCampaignRecipientAttributes = createEntityAttributes([
  'campaign',
  'campaignId',
  'organization',
  'organizationId',
  'conversation',
  'conversationId',
  'message',
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

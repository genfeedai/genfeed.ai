import { createEntityAttributes } from '@genfeedai/helpers';

export const socialConversationAttributes = createEntityAttributes([
  'organizationId',
  'userId',
  'brandId',
  'credentialId',
  'postId',
  'platform',
  'conversationType',
  'externalConversationId',
  'externalThreadId',
  'externalParentId',
  'sourceContentId',
  'sourceContentUrl',
  'sourceContentTitle',
  'sourceContentType',
  'accountExternalId',
  'accountHandle',
  'accountName',
  'participantExternalId',
  'participantHandle',
  'participantName',
  'participantAvatarUrl',
  'status',
  'priority',
  'unreadCount',
  'inboundSequence',
  'needsReview',
  'automationState',
  'assignedOwnerId',
  'tags',
  'latestMessageText',
  'latestMessageAt',
  'lastInboundAt',
  'lastOutboundAt',
  'availability',
  'metadata',
]);

export const socialInboxUnreadCountAttributes = createEntityAttributes([
  'unreadCount',
]);

export const socialSuggestedReplyAttributes = createEntityAttributes(['draft']);

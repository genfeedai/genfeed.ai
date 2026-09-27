import {
  socialConversationAttributes,
  socialInboxUnreadCountAttributes,
  socialSuggestedReplyAttributes,
} from '@serializers/attributes/social/social-conversation.attributes';

export const socialConversationSerializerConfig = {
  attributes: socialConversationAttributes,
  type: 'social-conversation',
};

export const socialInboxUnreadCountSerializerConfig = {
  attributes: socialInboxUnreadCountAttributes,
  type: 'social-inbox-unread-count',
};

export const socialSuggestedReplySerializerConfig = {
  attributes: socialSuggestedReplyAttributes,
  type: 'social-suggested-reply',
};

import {
  socialConversationAttributes,
  socialInboxUnreadCountAttributes,
} from '@serializers/attributes/social/social-conversation.attributes';

export const socialConversationSerializerConfig = {
  attributes: socialConversationAttributes,
  type: 'social-conversation',
};

export const socialInboxUnreadCountSerializerConfig = {
  attributes: socialInboxUnreadCountAttributes,
  type: 'social-inbox-unread-count',
};

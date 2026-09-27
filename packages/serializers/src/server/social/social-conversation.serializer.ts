import { buildSerializer } from '@serializers/builders';
import {
  socialConversationSerializerConfig,
  socialInboxUnreadCountSerializerConfig,
  socialSuggestedReplySerializerConfig,
} from '@serializers/configs';

export const { SocialConversationSerializer } = buildSerializer(
  'server',
  socialConversationSerializerConfig,
);

export const { SocialInboxUnreadCountSerializer } = buildSerializer(
  'server',
  socialInboxUnreadCountSerializerConfig,
);

export const { SocialSuggestedReplySerializer } = buildSerializer(
  'server',
  socialSuggestedReplySerializerConfig,
);

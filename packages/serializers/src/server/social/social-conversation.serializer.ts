import { buildSerializer } from '@serializers/builders';
import {
  socialConversationSerializerConfig,
  socialInboxUnreadCountSerializerConfig,
} from '@serializers/configs';

export const { SocialConversationSerializer } = buildSerializer(
  'server',
  socialConversationSerializerConfig,
);

export const { SocialInboxUnreadCountSerializer } = buildSerializer(
  'server',
  socialInboxUnreadCountSerializerConfig,
);

import { buildSerializer } from '@serializers/builders';
import { socialConversationSerializerConfig } from '@serializers/configs';

export const { SocialConversationSerializer } = buildSerializer(
  'server',
  socialConversationSerializerConfig,
);

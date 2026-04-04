import { replyBotConfigAttributes } from '@serializers/attributes/automation/reply-bot-config.attributes';
import { simpleConfig } from '@serializers/builders';

export const replyBotConfigSerializerConfig = simpleConfig(
  'reply-bot-config',
  replyBotConfigAttributes,
);

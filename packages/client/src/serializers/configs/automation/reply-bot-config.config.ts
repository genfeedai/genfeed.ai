import { replyBotConfigAttributes } from '../../attributes/automation/reply-bot-config.attributes';
import { simpleConfig } from '../../builders';

export const replyBotConfigSerializerConfig = simpleConfig(
  'reply-bot-config',
  replyBotConfigAttributes,
);

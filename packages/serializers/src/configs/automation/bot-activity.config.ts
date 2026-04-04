import { botActivityAttributes } from '@serializers/attributes/automation/bot-activity.attributes';
import { simpleConfig } from '@serializers/builders';

export const botActivitySerializerConfig = simpleConfig(
  'bot-activity',
  botActivityAttributes,
);

import { botActivityAttributes } from '../../attributes/automation/bot-activity.attributes';
import { simpleConfig } from '../../builders';

export const botActivitySerializerConfig = simpleConfig(
  'bot-activity',
  botActivityAttributes,
);

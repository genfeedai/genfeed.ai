import { livestreamBotSessionAttributes } from '@serializers/attributes/automation/livestream-bot-session.attributes';
import { simpleConfig } from '@serializers/builders';

export const livestreamBotSessionSerializerConfig = simpleConfig(
  'livestream-bot-session',
  livestreamBotSessionAttributes,
);

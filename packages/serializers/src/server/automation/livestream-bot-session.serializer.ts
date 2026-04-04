import { buildSerializer } from '@serializers/builders';
import { livestreamBotSessionSerializerConfig } from '@serializers/configs/automation/livestream-bot-session.config';

export const { LivestreamBotSessionSerializer } = buildSerializer(
  'server',
  livestreamBotSessionSerializerConfig,
);

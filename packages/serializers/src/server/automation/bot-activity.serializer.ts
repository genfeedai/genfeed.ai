import { buildSerializer } from '@serializers/builders';
import { botActivitySerializerConfig } from '@serializers/configs';

export const { BotActivitySerializer } = buildSerializer(
  'server',
  botActivitySerializerConfig,
);

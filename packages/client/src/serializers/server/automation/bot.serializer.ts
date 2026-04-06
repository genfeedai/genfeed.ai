import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { botSerializerConfig } from '../../configs';

export const BotSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  botSerializerConfig,
);

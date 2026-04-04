import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { botActivitySerializerConfig } from '../../configs';

export const BotActivitySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  botActivitySerializerConfig,
);

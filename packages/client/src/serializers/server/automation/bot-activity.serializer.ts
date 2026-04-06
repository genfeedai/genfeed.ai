import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { botActivitySerializerConfig } from '../../configs';

export const BotActivitySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  botActivitySerializerConfig,
);

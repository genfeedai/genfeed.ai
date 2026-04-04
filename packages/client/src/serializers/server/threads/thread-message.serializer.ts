import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { threadMessageSerializerConfig } from '../../configs';

export const ThreadMessageSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  threadMessageSerializerConfig,
);

import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { threadMessageSerializerConfig } from '../../configs';

export const ThreadMessageSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  threadMessageSerializerConfig,
);

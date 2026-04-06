import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { promptSerializerConfig } from '../../configs';

export const PromptSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  promptSerializerConfig,
);

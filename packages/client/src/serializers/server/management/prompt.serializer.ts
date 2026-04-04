import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { promptSerializerConfig } from '../../configs';

export const PromptSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  promptSerializerConfig,
);

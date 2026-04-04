import { buildSerializer } from '@serializers/builders';
import { promptSerializerConfig } from '@serializers/configs';

export const { PromptSerializer } = buildSerializer(
  'server',
  promptSerializerConfig,
);

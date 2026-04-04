import { buildSerializer } from '@serializers/builders';
import { modelSerializerConfig } from '@serializers/configs';

export const { ModelSerializer } = buildSerializer(
  'server',
  modelSerializerConfig,
);

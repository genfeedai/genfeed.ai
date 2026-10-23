import { buildSerializer } from '@serializers/builders';
import { modelDetailSerializerConfig } from '@serializers/configs';
export const { ModelDetailSerializer } = buildSerializer(
  'server',
  modelDetailSerializerConfig,
);

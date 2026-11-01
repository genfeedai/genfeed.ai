import { buildSerializer } from '@serializers/builders';
import { publishPipelineSerializerConfig } from '@serializers/configs';

export const { PublishPipelineSerializer } = buildSerializer(
  'server',
  publishPipelineSerializerConfig,
);

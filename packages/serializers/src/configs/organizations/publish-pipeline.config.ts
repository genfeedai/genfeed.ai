import { publishPipelineAttributes } from '@serializers/attributes/organizations/publish-pipeline.attributes';
import { simpleConfig } from '@serializers/builders';

export const publishPipelineSerializerConfig = simpleConfig(
  'publish-pipeline',
  publishPipelineAttributes,
);

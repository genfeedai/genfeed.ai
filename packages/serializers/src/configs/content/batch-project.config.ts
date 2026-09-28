import { batchProjectAttributes } from '@serializers/attributes/content/batch-project.attributes';
import { simpleConfig } from '@serializers/builders';

export const batchProjectSerializerConfig = simpleConfig(
  'batch-project',
  batchProjectAttributes,
);

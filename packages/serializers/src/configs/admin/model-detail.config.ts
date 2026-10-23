import { modelDetailAttributes } from '@serializers/attributes/admin/model-detail.attributes';
import { simpleConfig } from '@serializers/builders';
export const modelDetailSerializerConfig = simpleConfig(
  'model-detail',
  modelDetailAttributes,
);

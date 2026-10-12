import { brandVisionModelOptionsAttributes } from '@serializers/attributes/admin/brand-vision-model-options.attributes';
import { simpleConfig } from '@serializers/builders';

export const brandVisionModelOptionsSerializerConfig = simpleConfig(
  'brand-vision-model-options',
  brandVisionModelOptionsAttributes,
);

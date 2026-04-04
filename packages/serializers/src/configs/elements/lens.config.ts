import { elementLensAttributes } from '@serializers/attributes/elements/lens.attributes';
import { simpleConfig } from '@serializers/builders';

export const elementLensSerializerConfig = simpleConfig(
  'element-lens',
  elementLensAttributes,
);

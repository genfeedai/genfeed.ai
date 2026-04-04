import { elementLensAttributes } from '../../attributes/elements/lens.attributes';
import { simpleConfig } from '../../builders';

export const elementLensSerializerConfig = simpleConfig(
  'element-lens',
  elementLensAttributes,
);

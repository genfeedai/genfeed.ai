import { imageAttributes } from '@serializers/attributes/ingredients/image.attributes';
import { simpleConfig } from '@serializers/builders';

export const imageSerializerConfig = simpleConfig('image', imageAttributes);

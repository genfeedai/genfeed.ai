import { imageAttributes } from '@serializers/attributes/ingredients/image.attributes';
import { simpleConfig } from '@serializers/builders';
import { serializeImageEdit } from '@serializers/helpers/image-edit.helper';

export const imageSerializerConfig = {
  ...simpleConfig('image', imageAttributes),
  attributeDerivations: { imageEdit: serializeImageEdit },
};

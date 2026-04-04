import { elementSceneAttributes } from '@serializers/attributes/elements/scene.attributes';
import { simpleConfig } from '@serializers/builders';

export const elementSceneSerializerConfig = simpleConfig(
  'element-scene',
  elementSceneAttributes,
);

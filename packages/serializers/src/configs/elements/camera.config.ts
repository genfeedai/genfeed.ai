import { elementCameraAttributes } from '@serializers/attributes/elements/camera.attributes';
import { simpleConfig } from '@serializers/builders';

export const elementCameraSerializerConfig = simpleConfig(
  'element-camera',
  elementCameraAttributes,
);

import { elementCameraMovementAttributes } from '@serializers/attributes/elements/camera-movement.attributes';
import { simpleConfig } from '@serializers/builders';

export const elementCameraMovementSerializerConfig = simpleConfig(
  'element-camera-movement',
  elementCameraMovementAttributes,
);

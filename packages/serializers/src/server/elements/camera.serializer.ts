import { buildSerializer } from '@serializers/builders';
import { elementCameraSerializerConfig } from '@serializers/configs';

export const { ElementCameraSerializer } = buildSerializer(
  'server',
  elementCameraSerializerConfig,
);

export { ElementCameraSerializer as CameraSerializer };

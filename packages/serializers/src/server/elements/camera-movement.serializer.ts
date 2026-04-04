import { buildSerializer } from '@serializers/builders';
import { elementCameraMovementSerializerConfig } from '@serializers/configs';

export const { ElementCameraMovementSerializer } = buildSerializer(
  'server',
  elementCameraMovementSerializerConfig,
);

export { ElementCameraMovementSerializer as CameraMovementSerializer };

import { buildSerializer } from '@serializers/builders';
import { elementCameraMovementSerializerConfig } from '@serializers/configs';

const { ElementCameraMovementSerializer } = buildSerializer(
  'server',
  elementCameraMovementSerializerConfig,
);

export { ElementCameraMovementSerializer as CameraMovementSerializer };

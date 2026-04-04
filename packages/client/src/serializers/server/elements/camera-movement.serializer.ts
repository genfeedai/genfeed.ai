import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { elementCameraMovementSerializerConfig } from '../../configs';

export const ElementCameraMovementSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  elementCameraMovementSerializerConfig,
);

export { ElementCameraMovementSerializer as CameraMovementSerializer };

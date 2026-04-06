import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { elementCameraMovementSerializerConfig } from '../../configs';

export const ElementCameraMovementSerializer: BuiltSerializer =
  buildSingleSerializer('server', elementCameraMovementSerializerConfig);

export { ElementCameraMovementSerializer as CameraMovementSerializer };

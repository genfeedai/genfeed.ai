import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { elementCameraSerializerConfig } from '../../configs';

export const ElementCameraSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  elementCameraSerializerConfig,
);

export { ElementCameraSerializer as CameraSerializer };

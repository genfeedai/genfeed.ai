import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { elementSceneSerializerConfig } from '../../configs';

export const ElementSceneSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  elementSceneSerializerConfig,
);

export { ElementSceneSerializer as SceneSerializer };

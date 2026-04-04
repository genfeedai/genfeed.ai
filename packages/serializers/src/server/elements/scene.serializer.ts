import { buildSerializer } from '@serializers/builders';
import { elementSceneSerializerConfig } from '@serializers/configs';

export const { ElementSceneSerializer } = buildSerializer(
  'server',
  elementSceneSerializerConfig,
);

export { ElementSceneSerializer as SceneSerializer };

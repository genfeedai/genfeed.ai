import { buildSerializer } from '@serializers/builders';
import { elementSceneSerializerConfig } from '@serializers/configs';

const { ElementSceneSerializer } = buildSerializer(
  'server',
  elementSceneSerializerConfig,
);

export { ElementSceneSerializer as SceneSerializer };

import { buildSerializer } from '@serializers/builders';
import { elementLightingSerializerConfig } from '@serializers/configs';

export const { ElementLightingSerializer } = buildSerializer(
  'server',
  elementLightingSerializerConfig,
);

export { ElementLightingSerializer as LightingSerializer };

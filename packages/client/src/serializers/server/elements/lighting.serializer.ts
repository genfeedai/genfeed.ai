import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { elementLightingSerializerConfig } from '../../configs';

export const ElementLightingSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  elementLightingSerializerConfig,
);

export { ElementLightingSerializer as LightingSerializer };

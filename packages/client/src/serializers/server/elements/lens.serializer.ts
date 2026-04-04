import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { elementLensSerializerConfig } from '../../configs';

export const ElementLensSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  elementLensSerializerConfig,
);

export { ElementLensSerializer as LensSerializer };

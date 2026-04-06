import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { elementLensSerializerConfig } from '../../configs';

export const ElementLensSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  elementLensSerializerConfig,
);

export { ElementLensSerializer as LensSerializer };

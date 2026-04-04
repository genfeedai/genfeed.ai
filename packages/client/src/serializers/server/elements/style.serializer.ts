import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { elementStyleSerializerConfig } from '../../configs';

export const ElementStyleSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  elementStyleSerializerConfig,
);

export { ElementStyleSerializer as StyleSerializer };

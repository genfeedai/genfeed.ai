import { buildSerializer } from '@serializers/builders';
import { elementLensSerializerConfig } from '@serializers/configs';

export const { ElementLensSerializer } = buildSerializer(
  'server',
  elementLensSerializerConfig,
);

export { ElementLensSerializer as LensSerializer };

import { buildSerializer } from '@serializers/builders';
import { elementStyleSerializerConfig } from '@serializers/configs';

export const { ElementStyleSerializer } = buildSerializer(
  'server',
  elementStyleSerializerConfig,
);

export { ElementStyleSerializer as StyleSerializer };

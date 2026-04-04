import { buildSerializer } from '@serializers/builders';
import { contextBaseSerializerConfig } from '@serializers/configs';

export const { ContextBaseSerializer } = buildSerializer(
  'server',
  contextBaseSerializerConfig,
);

import { buildSerializer } from '@serializers/builders';
import { contextEntrySerializerConfig } from '@serializers/configs';

export const { ContextEntrySerializer } = buildSerializer(
  'server',
  contextEntrySerializerConfig,
);

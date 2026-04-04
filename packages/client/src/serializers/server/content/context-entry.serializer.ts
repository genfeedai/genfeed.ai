import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { contextEntrySerializerConfig } from '../../configs';

export const ContextEntrySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contextEntrySerializerConfig,
);

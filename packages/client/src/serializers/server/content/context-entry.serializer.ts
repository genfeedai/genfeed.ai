import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { contextEntrySerializerConfig } from '../../configs';

export const ContextEntrySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contextEntrySerializerConfig,
);

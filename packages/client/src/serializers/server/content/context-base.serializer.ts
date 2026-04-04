import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { contextBaseSerializerConfig } from '../../configs';

export const ContextBaseSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contextBaseSerializerConfig,
);

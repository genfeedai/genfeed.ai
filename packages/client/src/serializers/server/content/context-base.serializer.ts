import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { contextBaseSerializerConfig } from '../../configs';

export const ContextBaseSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contextBaseSerializerConfig,
);

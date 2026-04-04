import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { patternPlaybookSerializerConfig } from '../../configs';

export const PatternPlaybookSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  patternPlaybookSerializerConfig,
);

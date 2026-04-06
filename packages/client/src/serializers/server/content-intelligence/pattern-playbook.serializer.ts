import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { patternPlaybookSerializerConfig } from '../../configs';

export const PatternPlaybookSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  patternPlaybookSerializerConfig,
);

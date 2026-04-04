import { buildSerializer } from '@serializers/builders';
import { patternPlaybookSerializerConfig } from '@serializers/configs';

export const { PatternPlaybookSerializer } = buildSerializer(
  'server',
  patternPlaybookSerializerConfig,
);

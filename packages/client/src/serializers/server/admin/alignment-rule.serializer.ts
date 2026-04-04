import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { alignmentRuleSerializerConfig } from '../../configs';

export const AlignmentRuleSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  alignmentRuleSerializerConfig,
);

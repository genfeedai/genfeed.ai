import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { alignmentRuleSerializerConfig } from '../../configs';

export const AlignmentRuleSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  alignmentRuleSerializerConfig,
);

import { buildSerializer } from '@serializers/builders';
import { alignmentRuleSerializerConfig } from '@serializers/configs';

export const { AlignmentRuleSerializer } = buildSerializer(
  'server',
  alignmentRuleSerializerConfig,
);

import { alignmentRuleAttributes } from '@serializers/attributes/admin/alignment-rule.attributes';
import { simpleConfig } from '@serializers/builders';

export const alignmentRuleSerializerConfig = simpleConfig(
  'alignment-rule',
  alignmentRuleAttributes,
);

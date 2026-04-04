import { alignmentRuleAttributes } from '../../attributes/admin/alignment-rule.attributes';
import { simpleConfig } from '../../builders';

export const alignmentRuleSerializerConfig = simpleConfig(
  'alignment-rule',
  alignmentRuleAttributes,
);

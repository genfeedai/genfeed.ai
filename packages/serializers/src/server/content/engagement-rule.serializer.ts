import { buildSerializer } from '@serializers/builders';
import { engagementRuleSerializerConfig } from '@serializers/configs';

export const { EngagementRuleSerializer } = buildSerializer(
  'server',
  engagementRuleSerializerConfig,
);

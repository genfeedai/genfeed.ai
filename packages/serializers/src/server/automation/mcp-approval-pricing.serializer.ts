import { buildSerializer } from '@serializers/builders';
import { mcpApprovalPricingSerializerConfig } from '@serializers/configs/automation/mcp-approval-pricing.config';

export const { McpApprovalPricingSerializer } = buildSerializer(
  'server',
  mcpApprovalPricingSerializerConfig,
);

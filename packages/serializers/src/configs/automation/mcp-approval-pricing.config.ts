import { mcpApprovalPricingAttributes } from '@serializers/attributes/automation/mcp-approval-pricing.attributes';
import { simpleConfig } from '@serializers/builders';

export const mcpApprovalPricingSerializerConfig = simpleConfig(
  'mcp-approval-pricing',
  mcpApprovalPricingAttributes,
);

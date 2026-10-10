import { mcpApprovalStatusAttributes } from '@serializers/attributes/automation/mcp-approval-status.attributes';
import { simpleConfig } from '@serializers/builders';

export const mcpApprovalStatusSerializerConfig = simpleConfig(
  'mcp-approval-status',
  mcpApprovalStatusAttributes,
);

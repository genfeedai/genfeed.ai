import { buildSerializer } from '@serializers/builders';
import { mcpApprovalStatusSerializerConfig } from '@serializers/configs/automation/mcp-approval-status.config';

export const { McpApprovalStatusSerializer } = buildSerializer(
  'server',
  mcpApprovalStatusSerializerConfig,
);

import { ADMIN_MCP_TOOL_NAMES } from '@genfeedai/actions';
import type { LoggerService } from '@libs/logger/logger.service';
import type { McpRole } from '@mcp/services/auth.service';
import type { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * Two registries over one client, the way production serves them: the
 * standard endpoint for every tool, the admin endpoint for the admin-only
 * ones. `handleToolCall` goes to the endpoint that serves the tool, so a spec
 * can walk a whole flow (call a gated tool, then resolve its approval) as one
 * client would across both connectors.
 */
export function createEndpointRegistries(
  client: ClientService,
  logger: LoggerService,
  role: McpRole,
) {
  const standard = new ToolRegistryService(client, logger, role);
  const admin = new ToolRegistryService(
    client,
    logger,
    role,
    [],
    undefined,
    'admin',
  );
  const isAdminCall = (params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): boolean =>
    ADMIN_MCP_TOOL_NAMES.has(params.name) ||
    (params.name === 'onboard_brand' &&
      params.arguments?.action === 'create_from_url');
  return {
    admin,
    onModuleInit: () => standard.onModuleInit(),
    handleToolCall: (
      params: Parameters<ToolRegistryService['handleToolCall']>[0],
    ) => (isAdminCall(params) ? admin : standard).handleToolCall(params),
    standard,
  };
}

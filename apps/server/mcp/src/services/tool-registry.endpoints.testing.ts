import {
  ADMIN_MCP_TOOL_NAMES,
  getRetiredMcpCatalogTool,
} from '@genfeedai/actions';
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
      params.arguments?.action === 'create_from_url') ||
    (params.name === 'setup_brand' &&
      (params.arguments?.input as { action?: unknown } | undefined)?.action ===
        'create_from_url');
  return {
    admin,
    onModuleInit: () => standard.onModuleInit(),
    handleToolCall: (
      params: Parameters<ToolRegistryService['handleToolCall']>[0],
    ) =>
      (isAdminCall(params) ? admin : standard).handleToolCall(
        asMergedToolCall(params),
      ),
    standard,
  };
}

interface ToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * The call a client sends to reach an original tool's action: its merged tool
 * with `{action, input}`. A spec about one action's behaviour names the
 * original tool, and this turns it into the call the connection accepts.
 */
export function asMergedToolCall<T extends ToolCallParams>(params: T): T {
  const operation = getRetiredMcpCatalogTool(params.name);
  if (!operation) return params;
  // `organization` names the organization of the call, so it stays beside
  // `action` and is not part of the action's input.
  const { organization, ...input } = params.arguments ?? {};
  return {
    ...params,
    arguments: {
      action: operation.action,
      input,
      ...(organization === undefined ? {} : { organization }),
    },
    name: operation.canonicalName,
  };
}

/** A registry whose `handleToolCall` takes original tool names through {@link asMergedToolCall}. */
export function withMergedToolCalls<
  T extends { handleToolCall: (params: never) => unknown },
>(registry: T): T {
  return new Proxy(registry, {
    get(target, property) {
      if (property === 'handleToolCall') {
        return (params: ToolCallParams) =>
          (
            target.handleToolCall as unknown as (
              params: ToolCallParams,
            ) => unknown
          ).call(target, asMergedToolCall(params));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
